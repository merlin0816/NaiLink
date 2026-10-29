'use strict'
'require view'
'require view.daed-router.workspace as workspace'
'require view.daed-router.logs as nativeLogs'

// A fresh entry URL also bypasses cached native-log views after upgrading.
return view.extend({
  handleSave: null,
  handleSaveApply: null,
  handleReset: null,
  load: workspace.load,
  render: function (data) {
    // Keep diagnostics available when the service/API cannot open the panel.
    if (!data.running || !data.authorized) return nativeLogs.render()
    var frame = workspace.render(data)
    if (frame.tagName === 'IFRAME') {
      frame.src = '/cgi-bin/daed-router/#/logs'
      frame.title = 'NaiLink 运行日志'
    }
    return frame
  },
})
