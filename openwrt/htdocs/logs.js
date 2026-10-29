'use strict'
'require view'
'require view.daed-router.log-view as logView'

return view.extend({
  handleSave: null,
  handleSaveApply: null,
  handleReset: null,
  render: logView.render,
})
