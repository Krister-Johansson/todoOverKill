import { useForm, useStore } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { createProjectFn } from '#/fns/projects'
import { PROJECT_COLORS } from '#/lib/project-colors'
import { suggestProjectKey } from '#/lib/project-key'
import { createProjectSchema } from '#/schemas/project'

import { useAnnounce } from './live-region'
import { optionClass } from './theme-switch'

import type { CreateProjectResult } from '#/fns/projects'
import type { CreateProjectInput } from '#/schemas/project'

type CreatedProject = Extract<CreateProjectResult, { ok: true }>['project']

const FIELDS = [
  { name: 'name', label: 'Name' },
  { name: 'key', label: 'Key' },
  { name: 'color', label: 'Colour' },
] as const

const GENERIC_ERROR = 'Could not create the project. Try again.'

/** Field errors are strings or Standard Schema issues, depending on the source. */
function errorText(errors: Array<unknown>) {
  for (const error of errors) {
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message)
    }
  }
  return undefined
}

/**
 * The "New project" button and its dialog. Errors show under each field and
 * in a summary at the top that takes focus, so it is read once
 * (docs/accessibility.md 3.3.1, 3.3.3). After a create the dialog closes
 * without returning focus to the button: onCreated updates the list and
 * onFocusCreated moves focus to the new entry.
 */
export function CreateProjectDialog({
  onCreated,
  onFocusCreated,
}: {
  onCreated: (project: CreatedProject) => void
  onFocusCreated: (project: CreatedProject) => void
}) {
  const announce = useAnnounce()
  const id = useId()
  const fieldId = (name: string) => `${id}-${name}`
  const errorId = (name: string) => `${id}-${name}-error`
  const summaryRef = useRef<HTMLDivElement>(null)
  const keyEdited = useRef(false)
  const created = useRef<CreatedProject | null>(null)
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Bumped to move focus to the summary once it has rendered.
  const [summaryFocus, setSummaryFocus] = useState(0)

  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus()
  }, [summaryFocus])

  const mutation = useMutation({
    mutationFn: (data: CreateProjectInput) => createProjectFn({ data }),
  })

  const defaultValues: CreateProjectInput = {
    name: '',
    key: '',
    color: PROJECT_COLORS[0].value,
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: createProjectSchema },
    onSubmitInvalid: () => setSummaryFocus((count) => count + 1),
    onSubmit: async ({ value }) => {
      setFormError(null)
      let result: CreateProjectResult
      try {
        result = await mutation.mutateAsync(value)
      } catch {
        setFormError(GENERIC_ERROR)
        setSummaryFocus((count) => count + 1)
        return
      }
      if (!result.ok) {
        form.setFieldMeta('key', (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: result.message },
        }))
        setSummaryFocus((count) => count + 1)
        return
      }
      created.current = result.project
      onCreated(result.project)
      announce(`Project ${result.project.name} created`)
      setOpen(false)
    },
  })

  const fieldMeta = useStore(form.store, (state) => state.fieldMeta)
  const attempted = useStore(
    form.store,
    (state) => state.submissionAttempts > 0,
  )
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)
  const fieldErrors = FIELDS.flatMap(({ name, label }) => {
    const message = errorText(fieldMeta[name]?.errors ?? [])
    return message ? [{ name, label, message }] : []
  })
  const showSummary = (attempted && fieldErrors.length > 0) || !!formError

  function handleOpenChange(next: boolean) {
    if (next) {
      form.reset()
      keyEdited.current = false
      created.current = null
      setFormError(null)
    }
    setOpen(next)
  }

  function describedBy(name: string, help?: string) {
    const ids = [
      help,
      errorText(fieldMeta[name as 'name']?.errors ?? []) && errorId(name),
    ]
    return ids.filter(Boolean).join(' ') || undefined
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-start">
          <Plus aria-hidden="true" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => {
          // Escape and Cancel return focus to the trigger; a create sends it
          // to the new sidebar entry instead.
          const project = created.current
          if (!project) return
          event.preventDefault()
          created.current = null
          onFocusCreated(project)
        }}
      >
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Name the project and choose its key and colour. All fields are
            required.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!isSubmitting) void form.handleSubmit()
          }}
        >
          {showSummary && (
            <div
              ref={summaryRef}
              tabIndex={-1}
              aria-labelledby={`${id}-summary-title`}
              className="flex flex-col gap-2 rounded-md border-2 border-destructive p-3"
            >
              <h3 id={`${id}-summary-title`} className="font-semibold">
                {fieldErrors.length > 0
                  ? 'Fix these fields'
                  : 'There is a problem'}
              </h3>
              {formError && <p className="text-sm">{formError}</p>}
              {fieldErrors.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {fieldErrors.map(({ name, label, message }) => (
                    <li key={name}>
                      <a
                        href={`#${fieldId(name)}`}
                        className="inline-flex min-h-11 items-center text-destructive underline underline-offset-4"
                        onClick={(event) => {
                          event.preventDefault()
                          document.getElementById(fieldId(name))?.focus()
                        }}
                      >
                        {label}: {message}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form.Field
            name="name"
            listeners={{
              onChange: ({ value }) => {
                if (!keyEdited.current) {
                  form.setFieldValue('key', suggestProjectKey(value))
                }
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={fieldId('name')}>Name (required)</Label>
                <Input
                  id={fieldId('name')}
                  name="name"
                  autoComplete="off"
                  aria-required="true"
                  aria-invalid={
                    errorText(field.state.meta.errors) ? true : undefined
                  }
                  aria-describedby={describedBy('name')}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError
                  id={errorId('name')}
                  message={errorText(field.state.meta.errors)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="key">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={fieldId('key')}>Key (required)</Label>
                <p
                  id={`${id}-key-help`}
                  className="text-sm text-muted-foreground"
                >
                  2 to 10 letters or digits, starting with a letter. Task
                  references start with it, such as TOK-42.
                </p>
                <Input
                  id={fieldId('key')}
                  name="key"
                  autoComplete="off"
                  spellCheck={false}
                  aria-required="true"
                  aria-invalid={
                    errorText(field.state.meta.errors) ? true : undefined
                  }
                  aria-describedby={describedBy('key', `${id}-key-help`)}
                  className="uppercase"
                  value={field.state.value}
                  onChange={(event) => {
                    keyEdited.current = true
                    field.handleChange(event.target.value.toUpperCase())
                  }}
                />
                <FieldError
                  id={errorId('key')}
                  message={errorText(field.state.meta.errors)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="color">
            {(field) => (
              <fieldset
                aria-describedby={describedBy('color')}
                className="flex flex-col gap-2"
              >
                <legend className="mb-2 text-sm font-medium">
                  Colour (required)
                </legend>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_COLORS.map(({ name, value }, index) => (
                    <label key={value} className={optionClass}>
                      <input
                        type="radio"
                        id={index === 0 ? fieldId('color') : undefined}
                        name={`${id}-color`}
                        value={value}
                        checked={field.state.value === value}
                        onChange={() => field.handleChange(value)}
                        className="size-4 accent-primary"
                      />
                      <span
                        aria-hidden="true"
                        className="size-4 rounded-full"
                        style={{ backgroundColor: value }}
                      />
                      {name}
                    </label>
                  ))}
                </div>
                <FieldError
                  id={errorId('color')}
                  message={errorText(field.state.meta.errors)}
                />
              </fieldset>
            )}
          </form.Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">
              {isSubmitting ? 'Creating project…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm font-medium text-destructive">
      {message}
    </p>
  )
}
