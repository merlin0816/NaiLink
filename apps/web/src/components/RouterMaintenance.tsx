import { ChevronDown, Database, Download, LoaderCircle, RefreshCw } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { useRouterMaintenance } from '~/hooks/useRouterMaintenance'
import {
  jobActive,
  maintenanceMessages,
  newerVersion,
  releaseCheckExpired,
  updateTargetInstalled,
} from '~/utils/router-maintenance'

function MaintenanceProgress({ type }: { type: 'update' | 'geodata' }) {
  const { query, mutation } = useRouterMaintenance()
  const job = query.data?.job
  if (!job || (type === 'geodata' ? job.action !== 'geodata' : !['update', 'check'].includes(job.action))) return null
  const installedSinceFailure = type === 'update' && updateTargetInstalled(job, query.data?.current || '')
  const failed = job.state === 'error' && !installedSinceFailure
  const phases: Record<string, string> = {
    queued: '任务已排队',
    checking: '正在检查发布版本与配置',
    downloading: '正在下载更新文件',
    verifying: '正在校验文件',
    installing: '正在下载校验安装包、备份并升级，请勿断电',
    applying: '正在加载规则库',
    finished: '已完成',
  }
  return (
    <div
      role={failed ? 'alert' : 'status'}
      className={`rounded-lg border p-3 text-sm ${failed ? 'border-destructive/30 text-destructive' : 'bg-muted/40'}`}
    >
      <p className="flex items-center gap-2">
        {jobActive(job) && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {installedSinceFailure
          ? '上次在线任务未完成；当前安装版本已达到该次目标，可重新检查更新。'
          : job.state === 'error'
            ? maintenanceMessages[job.code || ''] || maintenanceMessages.operation_failed
            : job.state === 'success'
              ? job.action === 'check'
                ? '版本检查完成'
                : type === 'geodata'
                  ? job.code === 'already_latest'
                    ? '规则库已是最新，无需重新加载'
                    : '规则库已更新'
                  : '插件更新完成'
              : phases[job.phase] || '维护任务正在执行'}
      </p>
      {failed && job.code?.startsWith('download_') && (
        <a
          className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
          href="https://slobys.github.io/NaiLink/troubleshooting.html#download"
          target="_blank"
          rel="noopener noreferrer"
        >
          查看更新故障排查
        </a>
      )}
      {job.state === 'success' && job.action === 'update' && (
        <Button size="sm" className="mt-3 min-h-11" onClick={() => window.parent.location.reload()}>
          重新加载新版本
        </Button>
      )}
      {mutation.isError && <p className="mt-1">{mutation.error.message}</p>}
    </div>
  )
}

function MaintenanceConnection() {
  const { query } = useRouterMaintenance()
  if (!query.isError) return null
  return (
    <div role="alert" className="mt-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
      <p>{query.error.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => query.refetch()}>
          重新读取状态
        </Button>
        <Button variant="outline" className="min-h-11" onClick={() => window.parent.location.reload()}>
          重新加载后台
        </Button>
      </div>
    </div>
  )
}

export function RouterVersion() {
  const [open, setOpen] = useState(false)
  const { query, mutation, busy } = useRouterMaintenance()
  const data = query.data
  const loadedVersion = useRef<string | undefined>(undefined)
  const latest = data?.latest
  const available = !!latest && newerVersion(latest.version, data?.current || '')
  const show = () => {
    setOpen(true)
    loadedVersion.current ??= data?.current
    const justUpdated =
      data?.job?.action === 'update' && data.job.state === 'success' && data.current !== loadedVersion.current
    if (
      !busy &&
      !query.isError &&
      !justUpdated &&
      releaseCheckExpired(latest) &&
      (data?.job?.state !== 'error' || updateTargetInstalled(data.job, data.current))
    )
      mutation.mutate('check')
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="tabular-nums"
        onClick={show}
        disabled={query.isPending}
        aria-label={`NaiLink 版本 ${data?.current || '读取中'}，检查更新`}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
        {data?.current ? `v${data.current}` : '版本'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>NaiLink 在线更新</DialogTitle>
            <DialogDescription>
              保留节点、订阅、群组和配置。安装时会备份数据并重启服务，连接可能短暂中断。
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">当前版本</dt>
            <dd>{data?.current || '正在读取'}</dd>
            <dt className="text-muted-foreground">最新发布</dt>
            <dd>{latest ? `v${latest.version}` : '尚未检查'}</dd>
          </dl>
          <MaintenanceProgress type="update" />
          <MaintenanceConnection />
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          {!busy &&
            (data?.job?.state !== 'error' || updateTargetInstalled(data.job, data.current)) &&
            latest &&
            !available && <p className="text-sm text-muted-foreground">当前已是最新发布版本。</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy || query.isError}
              onClick={() => mutation.mutate('check')}
            >
              检查更新
            </Button>
            <Button
              className="min-h-11"
              disabled={busy || query.isError || !available}
              onClick={() => mutation.mutate('update')}
            >
              <Download aria-hidden="true" />
              更新到 {latest?.version || '最新版本'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function RouterGeodata() {
  const { query, mutation, busy } = useRouterMaintenance()
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const data = query.data?.geodata
  const job = query.data?.job?.action === 'geodata' ? query.data.job : undefined
  const updating = mutation.isPending || jobActive(job)
  return (
    <section
      className="@container min-w-0 rounded-2xl border bg-card p-4 shadow-sm"
      aria-label="GeoIP 和 GeoSite 规则库"
    >
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">GeoIP / GeoSite 规则库</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted-foreground">
              <p className="break-words">
                {query.isPending
                  ? '正在读取批次…'
                  : query.isError
                    ? '暂时无法读取状态'
                    : data
                      ? `当前批次 ${data.version}`
                      : '系统规则库或自定义文件'}
              </p>
              {!query.isError && job?.state === 'success' && (
                <span role="status" aria-label={job.code === 'already_latest' ? '规则库已是最新' : '规则库已更新'}>
                  {job.code === 'already_latest' ? '已是最新' : '已更新'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 px-2"
            aria-label="用途与详情"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="hidden @xs:inline">用途与详情</span>
            <span className="@xs:hidden">用途</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 px-2"
            disabled={busy || query.isPending || query.isError}
            onClick={() => mutation.mutate('geodata')}
          >
            <RefreshCw className={updating ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
            {updating ? '更新中…' : '更新规则库'}
          </Button>
        </div>
      </div>
      <div
        id={detailsId}
        hidden={!expanded}
        className="mt-3 space-y-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground"
      >
        <dl className="grid gap-3 @sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">GeoIP · 按 IP 判断地区</dt>
            <dd className="mt-1">例如识别中国大陆 IP 和局域网地址，供路由决定是否直连。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">GeoSite · 按域名分类</dt>
            <dd className="mt-1">例如识别国内网站，供路由和 DNS 决定访问出口及解析上游。</dd>
          </div>
        </dl>
        <p>
          只有路由或 DNS 引用的分类才会生效。更新规则库不改变现有分流策略；AI 等网站走哪个群组，仍由你的路由设置决定。
        </p>
        <p>三个内核使用同一份规则来源：dae 直接加载，sing-box、mihomo 转换为各自的规则后加载。</p>
        <p>
          来源：Loyalsoldier/v2ray-rules-dat。使用 NaiLink
          独立目录，两份文件一起校验更新；运行时重新加载已应用配置，失败恢复旧版，保留未应用的修改。
        </p>
      </div>
      {job && job.state !== 'success' && (
        <div className="mt-3">
          <MaintenanceProgress type="geodata" />
        </div>
      )}
      <MaintenanceConnection />
      {mutation.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
    </section>
  )
}
