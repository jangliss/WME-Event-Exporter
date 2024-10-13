/// <reference path="../typescript-typings/greasyfork.d.ts" />
/// <reference path="../typescript-typings/waze.d.ts" />
// ==UserScript==
// @name                WME Event-Exporter
// @version             2024.10.13.001
// @description         Export Event object to CSV for easy duplication of closures
// @match               https://beta.waze.com/*editor*
// @match               https://www.waze.com/*editor*
// @exclude             https://www.waze.com/*user/*editor/*
// @exclude             https://beta.waze.com/*user*/*editor/*
// @grant               GM_xmlhttpRequest
// @grant               unsafeWindow
// @copyright           2024, jangliss
// @author              jangliss
// ==/UserScript==

(function() {

  // Function used to send data to client //
  function sendCsvData(data, filename) {
    const csvString = [
      [
        'header',
        'reason',
        'start date (yyyy-mm-dd hh:mm)',
        'end date (yyyy-mm-dd hh:mm)',
        'direction (A to B|B to A|TWO WAY)',
        'ignore trafic (Yes|No)',
        'segment IDs (id1;id2;...)',
        'lon/lat (like in a permalink: lon=xxx&lat=yyy)',
        'zoom (14 to 22)',
        'MTE id (empty cell if not)',
        'comment (optional)'
      ],
      ...data.map(item => [
        item.header,
        item.reason,
        item.start,
        item.end,
        item.direction,
        item.permanent,
        item.segmentId,
        item.lonlat,
        item.zoom,
        item.mteId,
        item.comment
      ])
    ].map(e => e.join(','))
    .join("\n")


    const csvData  = 'data:text/csv;charset=utf-8,' + csvString
    let link = document.createElement('a')
    link.setAttribute('href', csvData)
    link.setAttribute('download',filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Function used to process data and send to client as CSV //
  function processReturnData(response) {
    if (response.status !== 200) {
      console.log( response.status )
      return
    }

    if (response.response.roadClosures.objects.length === 0) {
      console.log ("No closures for this MTE")
      return
    }

    // get MTE ID from URL //
    const mteId = response.finalUrl.split('id=').pop()
    

    closureData = []

    response.response.roadClosures.objects.forEach( closure => {
      if (closure.eventId !== mteId) {
        return
      }

      let closureDirection = 'TWO WAY'
      if (closure.forward) {
        closureDirection = 'A to B'
      } else {
        closureDirection = 'B to A'
      }

      let lonlat = ''
      if (closure.geometry.coordinates.length > 0) {
        lonlat = 'lon=' + closure.geometry.coordinates[0][0] + '&lat=' + closure.geometry.coordinates[0][1]
      }

      let closureRec = {
        header: 'add',
        reason: closure.reason,
        start: closure.startDate,
        end: closure.endDate,
        direction: closureDirection,
        permanent: (closure.permanent ? 'Yes': 'No'),
        segmentId: closure.segID,
        lonlat: lonlat,
        zoom: 17,
        mteId: mteId,
        comment: ''
      }

      const closureIdx = closureData.findIndex(
        (elem) => elem.start == closureRec.start && elem.end == closureRec.end && elem.segmentId == closureRec.segmentId
      )

      if (closureIdx !== -1) {
        if (closureData[closureIdx].direction !== 'TWO WAY' && closureData[closureIdx].direction !== closureRec.direction) {
          closureData.splice(closureIdx, 1)
          closureRec.direction = 'TWO WAY'
        }
      }

      closureData.push(closureRec)

    })

    sendCsvData(closureData, 'mte_closure.csv')

  }

  // Function used to perform export //
  function exportMTEEClosure() {
    const mteId = this.dataset.mteId
    const uri = W.Config.paths.mteDetails + '?id=' + mteId

    GM_xmlhttpRequest( {
      method: 'GET',
      url: uri,
      responseType: 'json',
      onload: processReturnData
    })

  }

  // Mutation Observer to look for the MTE tab and a specific event being selected //
  function hookEventTab(attempt = 0) {
    console.log('WMEEE: Hook Event')
    var mtePanel = document.getElementById('sidepanel-mtes')
    if (typeof mtePanel === 'undefined' || mtePanel === null) {
      if (attempt > 15) {
        console.error("Unable to find events tab after 15 attempts. No more attempts.")
        return;
      }
      attempt += 1
      setTimeout(
        hookEventTab.bind(attempt),
        500
      )
    } else {
      let exportButton = document.createElement('wz-button')
      exportButton.class = 'send-button'
      exportButton.innerText = 'Export Closures'
      exportButton.dataset.mteId = ''
      exportButton.addEventListener('click', exportMTEEClosure)

      let mteEditTabObserver = new MutationObserver( (mutations) => {
        // Get the Event ID and set to the button for sending //
        mutations.forEach(
          mutation => {
            // We have a mutation adding a node of type HTMLElement and it has a class of edit-panel - so we're in the MTE edit panel
            if ((mutation.addedNodes.length > 0) && (mutation.addedNodes[0] instanceof HTMLElement) && (mutation.addedNodes[0].classList.contains('edit-panel'))) {
              const elem = mutation.addedNodes[0]

              const mteHeader = elem.getElementsByTagName('wz-section-header')
              if ((typeof mteHeader === 'undefined') || mteHeader.length !== 1) {
                return
              }

              if (typeof mteHeader[0].subtitle === 'undefined' || mteHeader[0].subtitle === null) {
                return
              }
              const mteID = mteHeader[0].subtitle.split(':')[1].trim()
              exportButton.dataset.mteId = mteID

              const mteFooter = elem.getElementsByClassName('mte-footer-view')
              mteFooter[0].insertAdjacentElement('afterbegin', exportButton)

            }
          }
        )
      })

      mteEditTabObserver.observe( mtePanel, { childList: true, subtree: false })
    }
    console.log('WMEEE: End Hook Event')
  }


  function initWMEEE() {
    hookEventTab()
  }

  function bootstrapWMEEE() {
    console.log('WMEEE: Bootstraping')
    if (typeof W === 'object' && W.userscripts?.state.isReady) {
      initWMEEE()
    } else {
      setTimeout(bootstrapWMEEE, 500)
    }
  }

  $(document).ready( () => {
    bootstrapWMEEE()
  })
})()