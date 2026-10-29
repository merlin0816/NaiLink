/* Real LuCI/RPC/procd + private HTTPS future-release fixture; no real upgrade. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const { chromium } = require('playwright')
const base = process.env.DAED_PANEL_URL || 'http://localhost:18080'
const directory = process.env.DAED_PANEL_CONTROL
const output = process.env.DAED_MAINTENANCE_OUTPUT || '.build/maintenance-browser'
if (!directory) throw new Error('Set DAED_PANEL_CONTROL to native_panel --maintenance-fixture control')
fs.mkdirSync(output, { recursive: true })
async function control(action, extra = {}) {
  const id = `${Date.now()}-${Math.random()}`
  fs.writeFileSync(path.join(directory, 'command.json'), JSON.stringify({ id, action, ...extra }))
  for (let i = 0; i < 300; i++) {
    try {
      const value = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'))
      if (value.id === id) return value
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Fixture action timed out: ${action}`)
}
async function switchMenu(page, area) {
  await page.locator(`a[href$="/daed/${area}"]:visible`).first().click()
  await page
    .frameLocator('iframe')
    .locator(area === 'logs' ? '#router-log-output' : `[data-workspace="${area}"]`)
    .waitFor()
}
async function waitText(locator, pattern) {
  for (let i = 0; i < 100; i++) {
    if (pattern.test(await locator.textContent())) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.match(await locator.textContent(), pattern)
}
;(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.DAED_BROWSER_EXECUTABLE ? { executablePath: process.env.DAED_BROWSER_EXECUTABLE } : {}),
  })
  let page
  let rulesActions = 0
  const trackRulesActions = (page) =>
    page.on('request', (request) => {
      let value
      try {
        value = request.postDataJSON()
      } catch {
        return
      }
      for (const call of Array.isArray(value) ? value : [value]) {
        if (
          call?.params?.[1] === 'daed-router' &&
          call.params[2] === 'maintain' &&
          call.params[3]?.action === 'geodata'
        )
          rulesActions++
      }
    })
  try {
    let context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })
    page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    trackRulesActions(page)
    await page.goto(`${base}/cgi-bin/luci/admin/services/daed/dashboard`)
    await page.locator('input[name=luci_username]').fill('root')
    await page.locator('input[name=luci_password]').fill('fixture-password')
    await page.getByRole('button', { name: /Log in|登录/ }).click()
    let frame = page.frameLocator('iframe')
    await frame.locator('[data-workspace="dashboard"]').waitFor({ timeout: 45000 })
    const gql = async (query) => {
      const response = await context.request.post(`${base}/cgi-bin/daed-router/graphql`, {
        headers: { Origin: base },
        data: { query },
      })
      assert.equal(response.status(), 200)
      const value = await response.json()
      assert.ok(!value.errors, JSON.stringify(value.errors))
      return value.data
    }
    const resources =
      'query{configs{id name selected} dnss{id name selected dns{string}} routings{id name selected routing{string}} groups{id name policy nodes{id}} nodes{edges{id name link}} subscriptions{id tag link}}'
    const seeded = await gql(
      'mutation{importNodes(rollbackError:true,args:[{tag:"Recovery fixture",link:"socks5://127.0.0.1:19092#recovery"}]){error node{id}}}',
    )
    assert.equal(seeded.importNodes[0].error, null)
    await gql(
      'mutation{importSubscription(rollbackError:true,arg:{tag:"Recovery subscription",link:"http://127.0.0.1:18081/sub-a"}){sub{id}}}',
    )
    const before = await gql(resources)
    const generalBefore = await gql('query{general{dae{running modified}}}')
    await control('snapshot')
    await frame.getByRole('button', { name: /NaiLink 版本/ }).click()
    const dialog = frame.getByRole('dialog')
    await waitText(dialog, /v0\.6\.99/)
    await control('maintenance', { hold: true })
    await frame.getByRole('button', { name: '更新到 0.6.99' }).click()
    await waitText(dialog, /正在下载校验安装包、备份并升级/)
    await control('stop_maintenance')
    await waitText(dialog, /维护任务被中断/)
    assert.deepEqual(await gql(resources), before)
    await control('maintenance', { hold: false })
    await control('maintenance', { fail: 'install' })
    await frame.getByRole('button', { name: '更新到 0.6.99' }).click()
    await waitText(dialog, /已恢复原安装及服务状态/)
    assert.deepEqual(await gql(resources), before)
    await page.keyboard.press('Escape')
    await frame.getByRole('button', { name: /NaiLink 版本/ }).click()
    await waitText(dialog, /已恢复原安装及服务状态/)
    await control('maintenance', { fail: '', hold: true })
    await frame.getByRole('button', { name: '更新到 0.6.99' }).click()
    await waitText(dialog, /正在下载校验安装包、备份并升级/)
    await page.reload()
    await page.getByRole('heading', { name: '正在更新 NaiLink', exact: true }).waitFor()
    assert.equal(await page.locator('iframe').count(), 0)
    await control('maintenance', { hold: false })
    await frame.locator('[data-workspace="dashboard"]').waitFor({ timeout: 45000 })
    await switchMenu(page, 'advanced')
    await waitText(frame.locator('header'), /v0\.6\.99-1/)
    await frame.getByRole('button', { name: /NaiLink 版本/ }).click()
    await frame.getByRole('button', { name: '重新加载新版本' }).waitFor()
    await frame.getByRole('button', { name: '重新加载新版本' }).click()
    await frame.locator('[data-workspace="advanced"]').waitFor({ timeout: 45000 })
    assert.deepEqual(await gql(resources), before, 'update fixture changed user data')
    assert.equal(await frame.locator('.panel-advanced-grid > *').count(), 3)
    const headerRules = frame.locator('header').getByRole('button', { name: '更新规则', exact: true })
    const order = await frame.locator('.router-toolbar-actions > button').allTextContents()
    assert.match(order[0], /v0\.6\.99/)
    assert.equal(order[1], '更新规则')
    assert.match(order[2], /内核/)
    const actionsBefore = rulesActions
    await headerRules.click()
    const card = frame.getByRole('dialog', { name: 'GeoIP / GeoSite 规则库', exact: true })
    await card.getByText(/只有路由或 DNS 引用的分类才会生效/).waitFor()
    assert.equal(rulesActions, actionsBefore, 'opening the dialog must not start a rules update')
    await page.keyboard.press('Escape')
    await card.waitFor({ state: 'hidden' })
    assert.equal(await headerRules.evaluate((element) => element === document.activeElement), true)
    await headerRules.press('Enter')
    await card.waitFor()
    assert.equal(rulesActions, actionsBefore, 'reopening the dialog must not start an update')
    await card.getByRole('button', { name: '更新', exact: true }).click()
    await waitText(card, /规则库已更新/)
    assert.equal(rulesActions, actionsBefore + 1, 'only the explicit update action starts maintenance')
    const first = await control('maintenance')
    assert.match(first.current, /^data-/)
    assert.deepEqual(await gql(resources), before)
    assert.deepEqual(
      await gql('query{general{dae{running modified}}}'),
      generalBefore,
      'rules update applied pending config or enabled the proxy',
    )
    await control('maintenance', { fail: 'checksum', bump: true })
    await card.getByRole('button', { name: '更新', exact: true }).click()
    await waitText(card, /文件校验失败/)
    assert.equal(await card.getByRole('alert').isVisible(), true)
    assert.equal((await control('maintenance')).current, first.current)
    await control('maintenance', { fail: 'invalid_geodata', bump: true })
    await card.getByRole('button', { name: '更新', exact: true }).click()
    await waitText(card, /规则库格式或内容校验失败/)
    assert.equal((await control('maintenance')).current, first.current)
    await control('maintenance', { fail: '', custom: true })
    await card.getByRole('button', { name: '更新', exact: true }).click()
    await waitText(card, /检测到自定义 GeoIP/)
    assert.equal((await control('maintenance')).current, first.current)
    await control('maintenance', { custom: false })
    await card.getByRole('button', { name: '更新', exact: true }).click()
    await waitText(card, /规则库已更新/)
    const second = await control('maintenance')
    assert.notEqual(second.current, first.current)
    await card.getByRole('button', { name: '关闭', exact: true }).click()
    // Log colors are applied to inert text and keep continuation line severity.
    await control('logs', {
      text: 'time="now" level=info msg="normal"\ntime="now" level=warning msg="warning"\ncontinuation\ntime="now" level=error msg="<script>window.injected=1</script>"\n',
    })
    await switchMenu(page, 'logs')
    const pre = frame.locator('#router-log-output')
    await pre.locator('[data-log-level="error"]').waitFor()
    const colors = await pre
      .locator('[data-log-level]')
      .evaluateAll((elements) =>
        elements.map((element) => ({ level: element.dataset.logLevel, color: getComputedStyle(element).color })),
      )
    assert.equal(new Set(colors.map((item) => item.color)).size, 3)
    assert.equal(await frame.locator('body').evaluate(() => window.injected), undefined)
    await page.screenshot({ path: path.join(output, 'desktop-logs.png') })
    const storageState = await context.storageState()
    await context.close()
    context = await browser.newContext({
      storageState,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'zh-CN',
    })
    page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    trackRulesActions(page)
    await page.goto(`${base}/cgi-bin/luci/admin/services/daed/advanced`)
    frame = page.frameLocator('iframe')
    await frame.locator('[data-workspace="advanced"]').waitFor({ timeout: 45000 })
    await frame.locator('header').getByRole('button', { name: '更新规则', exact: true }).tap()
    const mobileCard = frame.getByRole('dialog', { name: 'GeoIP / GeoSite 规则库', exact: true })
    assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const button = mobileCard.getByRole('button', { name: '更新', exact: true })
    await mobileCard.getByText(/只有路由或 DNS 引用的分类才会生效/).waitFor()
    for (const action of await frame.locator('.advanced-profile-actions button').all()) {
      assert.ok((await action.boundingBox()).height >= 44, 'profile actions must be usable on touch')
      assert.ok(await action.getAttribute('aria-label'), 'profile icon action needs an accessible name')
    }
    await button.scrollIntoViewIfNeeded()
    assert.equal(await button.evaluate((el) => el.getBoundingClientRect().height >= 44), true)
    await mobileCard.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(output, 'mobile-geodata.png') })
    await control('maintenance', { fail: 'download', bump: true })
    await button.tap()
    await waitText(mobileCard, /GitHub 下载服务器返回异常响应/)
    assert.equal((await control('maintenance')).current, second.current)
    await control('maintenance', { fail: '' })
    await button.tap()
    await waitText(mobileCard, /规则库已更新/)
    const recovered = await control('geodata_crash')
    assert.equal(recovered.current, recovered.previous)
    assert.equal(recovered.receipt.state, 'rolled_back')
    assert.equal(recovered.unchanged, true)
    await page.reload()
    await frame.locator('[data-workspace="advanced"]').waitFor({ timeout: 45000 })
    await frame.locator('header').getByRole('button', { name: '更新规则', exact: true }).tap()
    await waitText(mobileCard, /新规则库加载失败，已恢复旧版/)
    assert.deepEqual(await gql(resources), before)
    await mobileCard.getByRole('button', { name: '关闭', exact: true }).tap()
    await control('maintenance', { next: '0.6.100' })
    await frame.getByRole('button', { name: /NaiLink 版本/ }).tap()
    await frame.getByRole('button', { name: '检查更新', exact: true }).tap()
    await waitText(frame.getByRole('dialog'), /v0\.6\.100/)
    await control('maintenance', { fail: 'install' })
    await frame.getByRole('button', { name: '更新到 0.6.100' }).tap()
    await waitText(frame.getByRole('dialog'), /已恢复原安装及服务状态/)
    await control('maintenance', { fail: '', hold: true })
    await frame.getByRole('button', { name: '更新到 0.6.100' }).tap()
    await waitText(frame.getByRole('dialog'), /正在下载校验安装包、备份并升级/)
    const session = await page.evaluate(async () => (await window.L.require('rpc')).getSessionID())
    await control('revoke_session', { session })
    await waitText(frame.getByRole('dialog'), /LuCI 登录已失效或没有维护权限/)
    const reconnect = frame.getByRole('button', { name: '重新加载后台', exact: true })
    assert.equal(await reconnect.evaluate((el) => el.getBoundingClientRect().height >= 44), true)
    if (await page.locator('#modal_overlay .btn.primary').isVisible())
      await page.locator('#modal_overlay .btn.primary').tap()
    else await reconnect.tap()
    await page.locator('input[name=luci_username]').fill('root')
    await page.locator('input[name=luci_password]').fill('fixture-password')
    await page.getByRole('button', { name: /Log in|登录/ }).tap()
    await page.getByRole('heading', { name: '正在更新 NaiLink', exact: true }).waitFor()
    await control('maintenance', { hold: false })
    await frame.locator('[data-workspace="advanced"]').waitFor({ timeout: 45000 })
    assert.deepEqual(await gql(resources), before)
    assert.deepEqual(errors, [])
    const result = {
      realLuCI: true,
      realRPC: true,
      realProcd: true,
      nativePackageLifecyclePreservedWorker: true,
      workerTerminationStopsInstaller: true,
      updateFailureAndRetry: true,
      nativeRefreshDuringInstall: true,
      privateHTTPSFixture: true,
      backgroundUpdateAcrossNavigation: true,
      refreshRecovery: true,
      userDataPreserved: true,
      geodataPairActivation: true,
      checksumAndFormatFailurePreservedOldData: true,
      customDataPreserved: true,
      pendingConfigurationPreserved: true,
      logColors: colors,
      mobileNoOverflow: true,
      mobileTouchFailureRetryAndSessionRecovery: true,
      geodataProcessCrashRecovery: true,
    }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
