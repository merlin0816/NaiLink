import { Check, Copy, Eye, Trash2, Type, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import {
  ScrollableDialogBody,
  ScrollableDialogContent,
  ScrollableDialogHeader,
} from '~/components/ui/scrollable-dialog'
import { SimpleTooltip } from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'

export function SimpleCard({
  name,
  selected,
  onSelect,
  onRemove,
  onRename,
  onDuplicate,
  actions,
  children,
}: {
  name: string
  selected: boolean
  onSelect?: () => void
  onRemove?: () => void
  onRename?: (newName: string) => void
  onDuplicate?: () => void
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  const { t } = useTranslation()
  const [openedDetailsModal, setOpenedDetailsModal] = useState(false)
  const [openedConfirmModal, setOpenedConfirmModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    setEditValue(name)
  }, [name])

  const handleStartEdit = () => {
    setEditValue(name)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setEditValue(name)
    setIsEditing(false)
  }

  const handleSaveEdit = () => {
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== name) {
      onRename?.(trimmedValue)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  return (
    <Fragment>
      <Card
        withBorder
        shadow="none"
        padding="none"
        className={cn(
          'advanced-profile min-w-0 transition-[border-color,background-color] duration-150 motion-reduce:transition-none',
          selected && 'border-primary bg-primary/5',
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between">
          {isEditing ? (
            <div className="flex min-w-0 flex-1 basis-32 items-center gap-2 p-2">
              <Input
                ref={inputRef}
                aria-label={t('actions.rename')}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveEdit}
                className="h-8 text-sm font-semibold"
              />
              <SimpleTooltip label={t('actions.confirm')}>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={t('actions.confirm')}
                  onClick={handleSaveEdit}
                  className="shrink-0"
                >
                  <Check className="h-4 w-4 text-primary" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip label={t('actions.cancel')}>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={t('actions.cancel')}
                  onClick={handleCancelEdit}
                  onMouseDown={(e) => e.preventDefault()}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                'min-w-0 flex-1 basis-24 rounded-xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                selected ? 'bg-primary/10' : 'hover:bg-accent',
              )}
              onClick={onSelect}
              aria-pressed={selected}
              title={name}
            >
              <div className="flex items-center gap-2">
                {selected && (
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground shrink-0">
                    <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" />
                  </div>
                )}
                <h4 className={cn('truncate font-semibold', selected && 'text-primary')}>{name}</h4>
              </div>
            </button>
          )}

          <div className="advanced-profile-actions ml-auto flex shrink-0 items-center gap-1 p-2">
            {!isEditing && onRename && (
              <SimpleTooltip label={t('actions.rename')}>
                <Button variant="ghost" size="xs" aria-label={t('actions.rename')} onClick={handleStartEdit}>
                  <Type className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
            )}

            {onDuplicate && (
              <SimpleTooltip label={t('actions.duplicate')}>
                <Button variant="ghost" size="xs" aria-label={t('actions.duplicate')} onClick={onDuplicate}>
                  <Copy className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
            )}

            {actions}

            {children && (
              <SimpleTooltip label={t('actions.viewDetails')}>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={t('actions.viewDetails')}
                  onClick={() => setOpenedDetailsModal(true)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
            )}

            {!selected && onRemove && (
              <SimpleTooltip label={t('actions.remove')}>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={t('actions.remove')}
                  className="text-destructive hover:text-destructive"
                  onClick={() => setOpenedConfirmModal(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={openedDetailsModal} onOpenChange={setOpenedDetailsModal}>
        <ScrollableDialogContent size="lg">
          <ScrollableDialogHeader>
            <DialogTitle>{name}</DialogTitle>
          </ScrollableDialogHeader>
          <ScrollableDialogBody>{children}</ScrollableDialogBody>
        </ScrollableDialogContent>
      </Dialog>

      <Dialog open={openedConfirmModal} onOpenChange={setOpenedConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('actions.remove')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('confirmModal.removeConfirmDescription')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenedConfirmModal(false)}>
              {t('confirmModal.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onRemove?.()
                setOpenedConfirmModal(false)
              }}
            >
              {t('confirmModal.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Fragment>
  )
}
