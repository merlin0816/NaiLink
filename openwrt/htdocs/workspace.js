'use strict'
'require view'
'require view.daed-router.workspace-view as workspaceView'

// Only this entry initializes a view; its helpers are side-effect-free baseclasses.
return view.extend({
  handleSave: null,
  handleSaveApply: null,
  handleReset: null,
  load: workspaceView.load,
  render: workspaceView.render,
})
