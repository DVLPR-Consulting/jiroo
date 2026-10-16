"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

/** Styled like `Input` (h-8, rounded-lg, border-input, focus ring) with a chevron. */
function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-card px-2.5 py-1 text-left text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 *:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 *:data-[slot=select-value]:truncate",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        align={align}
        sideOffset={position === "popper" ? sideOffset : undefined}
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
          position === "popper" && "w-(--radix-select-trigger-width) max-w-[min(28rem,calc(100vw-2rem))]",
          className
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&>span:last-child]:flex [&>span:last-child]:min-w-0 [&>span:last-child]:items-center [&>span:last-child]:gap-2",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon aria-hidden className="size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {/* Radix drops ItemText's className: the item styles it as its last child. */}
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUpIcon aria-hidden className="size-3.5" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDownIcon aria-hidden className="size-3.5" />
    </SelectPrimitive.ScrollDownButton>
  )
}

/**
 * Radix reserves the empty string for "no value" (placeholder), so an
 * explicit empty option (« Aucun », « Non assigné »…) travels under this
 * sentinel and comes back to callers as "".
 */
const EMPTY_OPTION_VALUE = "__select-field-empty__"

export type SelectFieldOption<V extends string = string> = {
  value: V
  label: string
  /** Decorative (hidden from assistive tech), before the label in the option and the trigger. */
  icon?: React.ReactNode
  disabled?: boolean
}

export type SelectFieldProps<V extends string = string> = {
  id?: string
  value: V
  onValueChange: (value: V) => void
  options: readonly SelectFieldOption<V>[]
  /** Shown when `value` matches no option. */
  placeholder?: string
  disabled?: boolean
  required?: boolean
  "aria-label"?: string
  "aria-describedby"?: string
  /**
   * Marks the trigger required without `required`, whose hidden native
   * select would let the browser block the form's submit on its own.
   */
  "aria-required"?: boolean
  "aria-invalid"?: boolean
  className?: string
  /** The trigger button (e.g. to focus it after a validation error). */
  triggerRef?: React.Ref<HTMLButtonElement>
  /** Non-selectable explanation below the choices. */
  footer?: React.ReactNode
}

/**
 * One accessible select (a Radix combobox) for the common "value + options"
 * case. Name it with a `<label htmlFor={id}>` or `aria-label`; an option
 * whose value is "" is a real choice, not the placeholder.
 */
function SelectField<V extends string = string>({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  required,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
  className,
  triggerRef,
  footer,
}: SelectFieldProps<V>) {
  const toRadix = (v: string) => (v === "" ? EMPTY_OPTION_VALUE : v)
  const selected = options.some((option) => option.value === value) ? toRadix(value) : ""
  return (
    <Select
      value={selected}
      onValueChange={(next) =>
        onValueChange((next === EMPTY_OPTION_VALUE ? "" : next) as V)
      }
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        ref={triggerRef}
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        // Radix sets aria-required from `required`; an explicit prop would override it.
        aria-required={ariaRequired ?? required}
        aria-invalid={ariaInvalid}
        className={className}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={toRadix(option.value)}
            disabled={option.disabled}
          >
            {option.icon ? (
              <span aria-hidden className="flex shrink-0 items-center">
                {option.icon}
              </span>
            ) : null}
            <span className="truncate">{option.label}</span>
          </SelectItem>
        ))}
        {footer}
      </SelectContent>
    </Select>
  )
}

export {
  Select,
  SelectContent,
  SelectField,
  SelectGroup,
  SelectItem,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
}
