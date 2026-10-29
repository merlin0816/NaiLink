import { ChevronDown, Database, Download, Globe2, LoaderCircle, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import {
  ScrollableDialogBody,
  ScrollableDialogContent,
  ScrollableDialogFooter,
  ScrollableDialogHeader,
} from '~/components/ui/scrollable-dialog'
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
  const [open, setOpen] = useState(false)
  const descriptionId = useId()
  const data = query.data?.geodata
  const job = query.data?.job?.action === 'geodata' ? query.data.job : undefined
  const updating = mutation.isPending || jobActive(job)
  const changeOpen = (value: boolean) => {
    setOpen(value)
    if (value) query.refetch()
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="更新规则">
          <RefreshCw className={`h-3.5 w-3.5 ${updating ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          更新规则
        </Button>
      </DialogTrigger>
      <ScrollableDialogContent
        size="lg"
        className="rounded-2xl sm:max-w-[35rem]"
        showCloseButton={false}
        aria-describedby={descriptionId}
      >
        <ScrollableDialogHeader className="gap-3 p-5 pr-14 text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <DialogTitle className="text-lg font-semibold">规则库更新</DialogTitle>
              <DialogDescription id={descriptionId} className="text-xs">
                GeoIP / GeoSite 分流数据
              </DialogDescription>
            </div>
          </div>
        </ScrollableDialogHeader>
        <ScrollableDialogBody className="space-y-4 overscroll-contain p-5 text-sm leading-relaxed">
          <dl className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <dt className="text-xs text-muted-foreground">当前批次</dt>
            <dd className="min-w-0 break-all rounded-md bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium tabular-nums">
              {query.isPending
                ? '正在读取…'
                : query.isError
                  ? '暂时无法读取状态'
                  : data?.version || '系统规则库或自定义文件'}
            </dd>
          </dl>
          {(job || updating || busy || query.isError || mutation.isError) && (
            <div className="sticky top-0 z-10 space-y-2 bg-background">
              <MaintenanceProgress type="geodata" />
              <MaintenanceConnection />
              {mutation.isError && (
                <p role="alert" className="text-destructive">
                  {mutation.error.message}
                </p>
              )}
              {mutation.isPending && !jobActive(job) && (
                <p role="status" className="text-xs text-muted-foreground">
                  正在提交更新任务…
                </p>
              )}
              {jobActive(job) && (
                <p className="text-xs text-muted-foreground">关闭窗口后更新仍会继续，可重新打开查看进度。</p>
              )}
              {busy && !updating && (
                <p className="text-xs text-muted-foreground">其他维护任务正在进行，请稍后更新规则库。</p>
              )}
            </div>
          )}
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/15 p-4">
              <dt className="flex items-center gap-2 font-semibold">
                <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                GeoIP
                <span className="ml-auto text-xs font-normal text-muted-foreground">IP 地区</span>
              </dt>
              <dd className="mt-2 text-[13px] text-muted-foreground">识别国家、地区与局域网 IP。</dd>
            </div>
            <div className="rounded-xl border bg-muted/15 p-4">
              <dt className="flex items-center gap-2 font-semibold">
                <Globe2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                GeoSite
                <span className="ml-auto text-xs font-normal text-muted-foreground">域名分类</span>
              </dt>
              <dd className="mt-2 text-[13px] text-muted-foreground">识别网站分类，供路由和 DNS 使用。</dd>
            </div>
          </dl>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            保留节点与分流策略。
          </p>
          <details className="group border-t pt-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              详细说明
              <ChevronDown
                className="h-4 w-4 shrink-0 motion-safe:transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="space-y-3 pb-1 pt-1 text-xs text-muted-foreground">
              <p>只有路由或 DNS 引用的分类才会生效。AI 等网站走哪个群组，仍由你的路由设置决定。</p>
              <p>三个内核共用同一来源：dae 直接加载，sing-box、mihomo 转换后加载。</p>
              <p className="break-words">
                来源：Loyalsoldier/v2ray-rules-dat。使用 NaiLink
                独立目录，两份文件一起校验；加载失败恢复旧版，保留未应用的修改。
              </p>
            </div>
          </details>
        </ScrollableDialogBody>
        <ScrollableDialogFooter className="flex-row items-center p-4 sm:px-5">
          <span className="mr-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            校验后生效
          </span>
          <DialogClose asChild>
            <Button variant="outline" className="min-h-11 flex-1 px-5 sm:flex-none">
              关闭
            </Button>
          </DialogClose>
          <Button
            className="min-h-11 flex-1 px-5 sm:flex-none"
            disabled={busy || query.isPending || query.isError}
            onClick={() => mutation.mutate('geodata')}
          >
            <RefreshCw className={updating ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
            {updating ? '正在更新…' : '更新'}
          </Button>
        </ScrollableDialogFooter>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 min-h-11 min-w-11"
            aria-label="关闭规则库更新窗口"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogClose>
      </ScrollableDialogContent>
    </Dialog>
  )
}
