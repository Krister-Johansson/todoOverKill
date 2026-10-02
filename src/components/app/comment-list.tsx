import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import {
  addCommentFn,
  commentsQueryOptions,
  deleteCommentFn,
  updateCommentFn,
} from '#/fns/comments'
import { taskActivityQueryOptions } from '#/fns/tasks'
import { formatDateTime, formatRelativeTime } from '#/lib/dates'
import { createCommentSchema } from '#/schemas/comment'

import { useAnnounce } from './live-region'
import { Markdown } from './markdown'

import type { QueryClient } from '@tanstack/react-query'
import type { RefObject } from 'react'
import type { listCommentsFn } from '#/fns/comments'

export type Comment = Awaited<ReturnType<typeof listCommentsFn>>[number]

const ADD_ERROR = 'Could not add the comment. Try again.'
const EDIT_ERROR = 'Could not edit the comment. Try again.'
const DELETE_ERROR = 'Could not delete the comment. Try again.'

/**
 * Every comment mutation on a task shares this key prefix, so isMutating
 * counts the ones in flight.
 */
export function commentMutationKey(taskId: string) {
  return ['comments', taskId] as const
}

/** The first problem with a body, or undefined when it is fine. */
function bodyError(body: string) {
  return createCommentSchema.safeParse({ body }).error?.issues[0]?.message
}

/**
 * True when focus is inside `element`, or nowhere, so a response that lands
 * late moves focus only when the user has not gone somewhere else meanwhile.
 */
function focusIsWithin(element: HTMLElement | null) {
  const active = document.activeElement
  return !active || active === document.body || !!element?.contains(active)
}

/** Focuses the first of the elements with these ids that is on the page. */
function focusFirst(candidates: Array<string>) {
  for (const id of candidates) {
    const element = document.getElementById(id)
    if (element) {
      element.focus()
      return
    }
  }
}

/** Edited means saved with a new body: the service writes nothing otherwise. */
function isEdited(comment: Pick<Comment, 'createdAt' | 'updatedAt'>) {
  return comment.updatedAt.getTime() > comment.createdAt.getTime()
}

/**
 * Runs after every comment mutation. The list refetches only once the last
 * one in flight settles, so a refetch sent before another write committed
 * cannot put back that write's old state. The activity log refetches every
 * time.
 */
function settle(queryClient: QueryClient, taskId: string) {
  // The settling mutation still counts as pending here.
  if (
    queryClient.isMutating({ mutationKey: commentMutationKey(taskId) }) === 1
  ) {
    void queryClient.invalidateQueries({
      queryKey: commentsQueryOptions(taskId).queryKey,
    })
  }
  void queryClient.invalidateQueries({
    queryKey: taskActivityQueryOptions(taskId).queryKey,
  })
}

type Ids = {
  article: (id: string) => string
  edit: (id: string) => string
  remove: (id: string) => string
  editBody: (id: string) => string
  composer: string
}

type FocusAfterRender = (...candidates: Array<string>) => void

type HeadingLevel = 2 | 3

type CommentListProps = {
  taskId: string
  /**
   * The moment the relative times count from, from the route loader, so the
   * server render and hydration print the same words.
   */
  now: Date
  headingLevel?: HeadingLevel
}

/**
 * A task's comments, oldest first, with their bodies as Markdown, and a form
 * below that adds one. Each comment is an article named "Comment N" that
 * takes focus from script only. Every change is announced through
 * useAnnounce; nothing here is a live region of its own (4.1.3). Writes wait
 * for the server: there is no optimistic state.
 *
 * Focus: after an add it is on the new comment; after a save or a cancelled
 * edit it is on the comment's Edit button; after a delete it is on the next
 * comment, else the previous one, else the New comment field. Cancelling the
 * delete dialog returns it to the Delete button. When the focused comment
 * disappears in a refetch, focus goes to the comment now in its place, so it
 * never drops to the page.
 */
export function CommentList({
  taskId,
  now,
  headingLevel = 2,
}: CommentListProps) {
  const Heading = `h${headingLevel}` as const
  const baseId = useId()
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const commentsKey = commentsQueryOptions(taskId).queryKey
  const { data: comments } = useSuspenseQuery(commentsQueryOptions(taskId))

  // The comment being edited, and which time it was opened, so a save that
  // lands after Cancel, or after the edit was opened again, leaves the edit
  // open now alone. The ref is read by responses from older renders.
  const [editing, setEditing] = useState<{ id: string; session: number }>()
  const editingRef = useRef(editing)
  const sessions = useRef(0)

  // The ids of the elements to try, in order, once the next render commits.
  const pendingFocus = useRef<Array<string>>([])
  const [, setFocusRequest] = useState(0)
  // The comment that last held focus and its place, for when it disappears.
  const lastFocused = useRef<{ id: string; index: number } | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  // Kept while the dialog closes, so its text does not empty mid-animation.
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    label: string
  }>()
  // Where focus goes when the dialog closes after a request; null returns it
  // to the Delete button.
  const closeFocus = useRef<Array<string> | null>(null)

  const ids: Ids = {
    article: (id) => `${baseId}-comment-${id}`,
    edit: (id) => `${baseId}-edit-${id}`,
    remove: (id) => `${baseId}-delete-${id}`,
    editBody: (id) => `${baseId}-body-${id}`,
    composer: `${baseId}-new`,
  }

  useEffect(() => {
    const candidates = pendingFocus.current
    if (candidates.length === 0) return
    pendingFocus.current = []
    focusFirst(candidates)
  })

  useEffect(() => {
    const last = lastFocused.current
    if (!last || comments.some((comment) => comment.id === last.id)) return
    lastFocused.current = null
    const active = document.activeElement
    if (active && active !== document.body) return
    const next = comments.at(last.index) ?? comments.at(last.index - 1)
    focusFirst(next ? [ids.article(next.id), ids.composer] : [ids.composer])
  }, [comments])

  function focusAfterRender(...candidates: Array<string>) {
    pendingFocus.current = candidates
    setFocusRequest((count) => count + 1)
  }

  function startEdit(id: string) {
    sessions.current += 1
    const next = { id, session: sessions.current }
    editingRef.current = next
    setEditing(next)
  }

  function stopEdit() {
    editingRef.current = undefined
    setEditing(undefined)
  }

  /** The comment after `id`, else the one before it, else the composer. */
  function focusInPlaceOf(rows: Array<Comment>, id: string) {
    const index = rows.findIndex((row) => row.id === id)
    const rest = rows.filter((row) => row.id !== id)
    const next = index >= 0 ? (rest[index] ?? rest[index - 1]) : undefined
    return next ? [ids.article(next.id), ids.composer] : [ids.composer]
  }

  const remove = useMutation({
    mutationKey: [...commentMutationKey(taskId), 'delete'],
    mutationFn: (id: string) => deleteCommentFn({ data: id }),
    onSuccess: (_deleted, id) => {
      const rows = queryClient.getQueryData(commentsKey) ?? []
      closeFocus.current = focusInPlaceOf(rows, id)
      queryClient.setQueryData(
        commentsKey,
        rows.filter((row) => row.id !== id),
      )
      setDeleteOpen(false)
      announce('Comment deleted')
    },
    onError: (_error, id) => {
      const rows = queryClient.getQueryData(commentsKey) ?? []
      // The comment may be gone already, deleted somewhere else; the refetch
      // in settle then removes it here too.
      closeFocus.current = [ids.remove(id), ...focusInPlaceOf(rows, id)]
      setDeleteOpen(false)
      announce(DELETE_ERROR)
    },
    onSettled: () => settle(queryClient, taskId),
  })

  return (
    <section
      aria-labelledby={`${baseId}-heading`}
      className="flex min-w-0 flex-col gap-3"
    >
      <Heading id={`${baseId}-heading`} className="text-lg font-semibold">
        Comments
      </Heading>
      {comments.length > 0 ? (
        <ol
          className="flex max-w-prose min-w-0 flex-col gap-4"
          onFocus={(event) => {
            const item = (event.target as HTMLElement).closest<HTMLElement>(
              '[data-comment-id]',
            )
            const id = item?.dataset.commentId
            if (!id) return
            const index = comments.findIndex((comment) => comment.id === id)
            if (index >= 0) lastFocused.current = { id, index }
          }}
        >
          {comments.map((comment, index) => {
            const label = `Comment ${index + 1}`
            const session =
              editing?.id === comment.id ? editing.session : undefined
            return (
              <li key={comment.id} className="min-w-0">
                <article
                  id={ids.article(comment.id)}
                  data-comment-id={comment.id}
                  tabIndex={-1}
                  aria-label={label}
                  className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3"
                >
                  <p className="text-sm text-muted-foreground">
                    <time dateTime={comment.createdAt.toISOString()}>
                      {`${formatRelativeTime(comment.createdAt, now)} (${formatDateTime(comment.createdAt)})`}
                    </time>
                    {isEdited(comment) && ', edited'}
                  </p>
                  {session !== undefined ? (
                    <EditForm
                      key={session}
                      taskId={taskId}
                      comment={comment}
                      textareaId={ids.editBody(comment.id)}
                      summaryHeadingLevel={(headingLevel + 1) as 3 | 4}
                      onDone={() => {
                        // A save that lands after Cancel, or after another
                        // edit was opened, leaves the current edit alone.
                        if (editingRef.current?.session !== session) return
                        stopEdit()
                        focusAfterRender(
                          ids.edit(comment.id),
                          ids.article(comment.id),
                          ids.composer,
                        )
                      }}
                    />
                  ) : (
                    <>
                      <Markdown headingLevel={headingLevel}>
                        {comment.body}
                      </Markdown>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          id={ids.edit(comment.id)}
                          variant="ghost"
                          onClick={() => startEdit(comment.id)}
                        >
                          Edit <span className="sr-only">{label}</span>
                        </Button>
                        <Button
                          id={ids.remove(comment.id)}
                          variant="ghost"
                          aria-haspopup="dialog"
                          onClick={() => {
                            setDeleteTarget({ id: comment.id, label })
                            setDeleteOpen(true)
                          }}
                        >
                          Delete <span className="sr-only">{label}</span>
                        </Button>
                      </div>
                    </>
                  )}
                </article>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-muted-foreground">No comments yet</p>
      )}
      <Composer
        taskId={taskId}
        ids={ids}
        summaryHeadingLevel={(headingLevel + 1) as 3 | 4}
        focusAfterRender={focusAfterRender}
      />
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          // While a delete is in flight the dialog stays open, so its result
          // always belongs to the dialog the user sees.
          if (!open && !remove.isPending) setDeleteOpen(false)
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Radix would focus its Trigger, and the Delete buttons are not
            // one, so focus is placed here every time.
            event.preventDefault()
            const candidates = closeFocus.current
            closeFocus.current = null
            if (candidates) {
              focusAfterRender(...candidates)
            } else if (deleteTarget) {
              focusAfterRender(
                ids.remove(deleteTarget.id),
                ...focusInPlaceOf(comments, deleteTarget.id),
              )
            } else {
              focusAfterRender(ids.composer)
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.label} will be removed from the task. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              aria-disabled={remove.isPending || undefined}
              onClick={(event) => {
                if (remove.isPending) event.preventDefault()
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              aria-disabled={remove.isPending || undefined}
              onClick={(event) => {
                // The dialog closes once the server answers, not on click.
                event.preventDefault()
                if (!remove.isPending && deleteTarget) {
                  remove.mutate(deleteTarget.id)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/** Bumped to move focus to the summary once it has rendered. */
function useSummaryFocus() {
  const summaryRef = useRef<HTMLDivElement>(null)
  const [request, setRequest] = useState(0)
  useEffect(() => {
    if (request > 0) summaryRef.current?.focus()
  }, [request])
  return [summaryRef, () => setRequest((count) => count + 1)] as const
}

/**
 * The problems with a comment form, at its top, as on the New task dialog: a
 * field error links to its field, and a server problem is a sentence. It
 * takes focus from script (3.3.1, 3.3.3).
 */
function ErrorSummary({
  summaryRef,
  headingLevel,
  fieldId,
  fieldLabel,
  fieldError,
  formError,
}: {
  summaryRef: RefObject<HTMLDivElement | null>
  headingLevel: 3 | 4
  fieldId: string
  fieldLabel: string
  fieldError?: string
  formError?: string
}) {
  const Heading = `h${headingLevel}` as const
  const titleId = `${fieldId}-summary-title`
  if (!fieldError && !formError) return null
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-md border-2 border-destructive p-3"
    >
      <Heading id={titleId} className="font-semibold">
        {fieldError ? 'Fix these fields' : 'There is a problem'}
      </Heading>
      {formError && <p className="text-sm">{formError}</p>}
      {fieldError && (
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <a
              href={`#${fieldId}`}
              className="inline-flex min-h-11 items-center text-destructive underline underline-offset-4"
              onClick={(event) => {
                event.preventDefault()
                document.getElementById(fieldId)?.focus()
              }}
            >
              {fieldLabel}: {fieldError}
            </a>
          </li>
        </ul>
      )}
    </div>
  )
}

function EditForm({
  taskId,
  comment,
  textareaId,
  summaryHeadingLevel,
  onDone,
}: {
  taskId: string
  comment: Comment
  textareaId: string
  summaryHeadingLevel: 3 | 4
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [summaryRef, focusSummary] = useSummaryFocus()
  const [body, setBody] = useState(comment.body)
  const [fieldError, setFieldError] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const errorId = `${textareaId}-error`
  const save = useMutation({
    mutationKey: [...commentMutationKey(taskId), 'edit', comment.id],
    mutationFn: (next: string) =>
      updateCommentFn({
        data: { commentId: comment.id, data: { body: next } },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(commentsQueryOptions(taskId).queryKey, (rows) =>
        rows?.map((row) => (row.id === updated.id ? updated : row)),
      )
      onDone()
      announce('Comment edited')
    },
    onError: () => {
      // A form closed meanwhile has gone, and its state with it; only the
      // announcement remains.
      setFormError(EDIT_ERROR)
      if (focusIsWithin(formRef.current)) focusSummary()
      announce(EDIT_ERROR)
    },
    onSettled: () => settle(queryClient, taskId),
  })

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (save.isPending) return
    const problem = bodyError(body)
    setFieldError(problem)
    setFormError(undefined)
    if (problem) {
      focusSummary()
      announce(problem)
      return
    }
    if (body.trim() === comment.body.trim()) {
      onDone()
      return
    }
    save.mutate(body)
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onDone()
        }
      }}
      className="flex min-w-0 flex-col gap-2"
    >
      <ErrorSummary
        summaryRef={summaryRef}
        headingLevel={summaryHeadingLevel}
        fieldId={textareaId}
        fieldLabel="Edit comment"
        fieldError={fieldError}
        formError={formError}
      />
      <Label htmlFor={textareaId}>Edit comment</Label>
      <Textarea
        ref={textareaRef}
        id={textareaId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
      />
      {fieldError && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {fieldError}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <Button type="submit" aria-disabled={save.isPending || undefined}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Composer({
  taskId,
  ids,
  summaryHeadingLevel,
  focusAfterRender,
}: {
  taskId: string
  ids: Ids
  summaryHeadingLevel: 3 | 4
  focusAfterRender: FocusAfterRender
}) {
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const formRef = useRef<HTMLFormElement>(null)
  const [summaryRef, focusSummary] = useSummaryFocus()
  const [body, setBody] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const textareaId = ids.composer
  const errorId = `${textareaId}-error`
  const add = useMutation({
    mutationKey: [...commentMutationKey(taskId), 'add'],
    mutationFn: (next: string) =>
      addCommentFn({ data: { taskId, data: { body: next } } }),
    onSuccess: (added, submitted) => {
      queryClient.setQueryData(commentsQueryOptions(taskId).queryKey, (rows) =>
        rows?.some((row) => row.id === added.id)
          ? rows
          : [...(rows ?? []), added],
      )
      // Text typed while the request was out stays.
      setBody((current) => (current === submitted ? '' : current))
      // Focus moves only from where the user left it, never out of an edit
      // they opened meanwhile.
      if (focusIsWithin(formRef.current)) {
        focusAfterRender(ids.article(added.id), textareaId)
      }
      announce('Comment added')
    },
    onError: () => {
      setFormError(ADD_ERROR)
      if (focusIsWithin(formRef.current)) focusSummary()
      announce(ADD_ERROR)
    },
    onSettled: () => settle(queryClient, taskId),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (add.isPending) return
    const problem = bodyError(body)
    setFieldError(problem)
    setFormError(undefined)
    if (problem) {
      focusSummary()
      announce(problem)
      return
    }
    add.mutate(body)
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      className="flex max-w-prose min-w-0 flex-col gap-2"
    >
      <ErrorSummary
        summaryRef={summaryRef}
        headingLevel={summaryHeadingLevel}
        fieldId={textareaId}
        fieldLabel="New comment"
        fieldError={fieldError}
        formError={formError}
      />
      <Label htmlFor={textareaId}>New comment</Label>
      <Textarea
        id={textareaId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
      />
      {fieldError && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {fieldError}
        </p>
      )}
      <div>
        <Button type="submit" aria-disabled={add.isPending || undefined}>
          Add comment
        </Button>
      </div>
    </form>
  )
}
