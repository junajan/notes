<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useNoteStore } from '../stores/noteStore'

const store = useNoteStore()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumbersRef = ref<HTMLDivElement | null>(null)
const copyFeedback = ref(false)

defineEmits(['openDeleteModal'])

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
  resizeObserver = new ResizeObserver(() => scheduleMeasure())
  if (textareaRef.value) resizeObserver.observe(textareaRef.value)
  // Web fonts change glyph widths, so wrapping can differ once they finish loading
  document.fonts?.ready.then(() => scheduleMeasure())
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
  resizeObserver?.disconnect()
  if (measureFrame) cancelAnimationFrame(measureFrame)
  mirror?.remove()
  mirror = null
})

const lineNumbers = computed(() => {
  const lines = (store.activeNote?.content || '').split('\n').length
  return Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1)
})

/*
 * Gutter alignment with soft-wrapped lines.
 * The textarea wraps long lines onto several visual rows, but the gutter has one number per
 * logical line. Without compensation every wrapped line shifts all following numbers up, so
 * they drift out of step and the last lines end up without numbers. We lay the text out in a
 * hidden mirror with the textarea's font and content width, measure each logical line's
 * rendered height, and give its gutter row the same height.
 */
const lineHeights = ref<number[]>([])
let mirror: HTMLDivElement | null = null
let measureFrame: number | null = null

const measureLineHeights = () => {
  measureFrame = null
  const textarea = textareaRef.value
  if (!textarea) return

  if (!mirror) {
    mirror = document.createElement('div')
    mirror.setAttribute('aria-hidden', 'true')
    document.body.appendChild(mirror)
  }

  const style = getComputedStyle(textarea)
  const contentWidth = textarea.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    top: '0',
    left: '-10000px',
    boxSizing: 'content-box',
    width: `${Math.max(contentWidth, 0)}px`,
    padding: '0',
    border: '0',
    whiteSpace: 'pre-wrap',
    overflowWrap: style.overflowWrap,
    wordBreak: style.wordBreak,
    font: style.font,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    tabSize: style.tabSize,
  })

  mirror.replaceChildren(...textarea.value.split('\n').map(line => {
    const row = document.createElement('div')
    row.textContent = line || '\u200b' // keep empty lines one row tall
    return row
  }))
  lineHeights.value = Array.from(mirror.children, row => row.getBoundingClientRect().height)
  syncScroll()
}

const scheduleMeasure = () => {
  if (measureFrame === null) measureFrame = requestAnimationFrame(measureLineHeights)
}

// The textarea is only rendered while a note is open, so (re)observe it whenever it mounts
watch(textareaRef, (el, prev) => {
  if (prev) resizeObserver?.unobserve(prev)
  if (el) resizeObserver?.observe(el)
})

watch(
  () => [store.activeNote?.content, store.activeNoteId, store.theme],
  () => nextTick(scheduleMeasure),
  { immediate: true }
)

const conflict = computed(() =>
  store.activeNoteId ? store.conflicts[store.activeNoteId] : undefined
)

const saveStatus = computed(() => {
  const id = store.activeNoteId
  if (conflict.value) return 'Not saved: changed in another window'
  if (id && store.remoteUpdateNotice === id) return 'Updated from another window'
  if (store.error) return store.error
  return store.isSaving ? 'Saving...' : 'All changes saved'
})

// When the content is replaced from another window while the textarea is focused,
// keep the caret where it was instead of letting it jump to the end
watch(() => [store.activeNoteId, store.activeNote?.content] as const, ([id], [prevId]) => {
  const textarea = textareaRef.value
  if (!textarea || id !== prevId || document.activeElement !== textarea) return
  const { selectionStart, selectionEnd } = textarea
  nextTick(() => {
    if (document.activeElement === textarea) textarea.setSelectionRange(selectionStart, selectionEnd)
  })
})

/**
 * Replaces [start, end) of the textarea through the browser's own editing pipeline, so the
 * change lands on the native undo stack and Cmd/Ctrl+Z can revert it. Assigning the value
 * programmatically (as the line shortcuts used to) wipes the undo history instead.
 * The resulting `input` event saves the note via handleContentChange.
 */
const replaceRange = (textarea: HTMLTextAreaElement, start: number, end: number, text: string) => {
  textarea.focus()
  textarea.setSelectionRange(start, end)
  // execCommand is deprecated but still the only way to edit a textarea with undo support
  const handled = text
    ? document.execCommand('insertText', false, text)
    : document.execCommand('delete', false)
  if (!handled) {
    textarea.setRangeText(text, start, end, 'end')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

const syncScroll = () => {
  if (textareaRef.value && lineNumbersRef.value) {
    lineNumbersRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

const handleTitleChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (store.activeNoteId && target) {
    store.updateNote(store.activeNoteId, { title: target.value || '' })
  }
}

const handleSlugChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (store.activeNoteId && target) {
    const slug = target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    store.updateNote(store.activeNoteId, { slug: slug || null })
  }
}

const handleContentChange = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  if (store.activeNoteId && target) {
    store.updateNote(store.activeNoteId, { content: target.value || '' })
  }
  nextTick(syncScroll)
}

const copyLink = async () => {
  try {
    let url = window.location.origin
    if (store.activeNote?.isPublic && store.activeNote?.slug) {
      url += '/' + store.activeNote.slug
    } else {
      url += '/?note=' + store.activeNoteId
    }
    await navigator.clipboard.writeText(url)
    copyFeedback.value = true
    setTimeout(() => {
      copyFeedback.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy: ', err)
  }
}

const togglePublic = () => {
  if (store.activeNote && store.isAuthenticated) {
    const newValue = store.activeNote.isPublic ? 0 : 1
    store.updateNote(store.activeNote.id, { isPublic: newValue })
  }
}

const togglePublicEditable = () => {
  if (store.activeNote && store.isAuthenticated) {
    const newValue = store.activeNote.isPublicEditable ? 0 : 1
    store.updateNote(store.activeNote.id, { isPublicEditable: newValue })
  }
}

const duplicateCurrentLine = () => {
  const textarea = textareaRef.value
  if (!textarea || !store.activeNoteId || !store.activeNote) return

  const { selectionStart, selectionEnd, value } = textarea
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  let lineEnd = value.indexOf('\n', selectionEnd)
  if (lineEnd === -1) lineEnd = value.length

  const lineContent = value.substring(lineStart, lineEnd)
  replaceRange(textarea, lineEnd, lineEnd, '\n' + lineContent)

  nextTick(() => {
    const offset = lineContent.length + 1
    textarea.setSelectionRange(selectionStart + offset, selectionEnd + offset)
    syncScroll()
  })
}

const cutCurrentLine = async () => {
  const textarea = textareaRef.value
  if (!textarea || !store.activeNoteId || !store.activeNote) return

  const { selectionStart, value } = textarea
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  let lineEnd = value.indexOf('\n', selectionStart)
  
  // Range to remove: the line plus its trailing newline, or for the last line its
  // preceding newline, so no empty line is left behind
  let lineToCut = ''
  let removeStart = lineStart
  let removeEnd = value.length

  if (lineEnd === -1) {
    lineToCut = value.substring(lineStart)
    if (lineStart > 0) removeStart = lineStart - 1
  } else {
    lineToCut = value.substring(lineStart, lineEnd)
    removeEnd = lineEnd + 1
  }

  try {
    await navigator.clipboard.writeText(lineToCut)
    replaceRange(textarea, removeStart, removeEnd, '')
    nextTick(() => {
      textarea.setSelectionRange(removeStart, removeStart)
      syncScroll()
    })
  } catch (err) {
    console.error('Failed to cut line:', err)
  }
}

const moveLine = (direction: number) => {
  const textarea = textareaRef.value
  if (!textarea || !store.activeNoteId || !store.activeNote) return

  const { selectionStart, value } = textarea
  const lines = value.split('\n')
  
  let currentPos = 0
  let lineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    const lineEnd = currentPos + line.length
    if (selectionStart >= currentPos && selectionStart <= lineEnd) {
      lineIndex = i
      break
    }
    currentPos = lineEnd + 1
  }

  if (lineIndex === -1) return

  const targetIndex = lineIndex + direction
  if (targetIndex < 0 || targetIndex >= lines.length) return

  const newLines = [...lines]
  const temp = newLines[lineIndex]
  const targetLine = newLines[targetIndex]
  
  if (temp !== undefined && targetLine !== undefined) {
    newLines[lineIndex] = targetLine
    newLines[targetIndex] = temp
  }

  // Only replace the two swapped lines, so undo restores exactly that change
  const firstIndex = Math.min(lineIndex, targetIndex)
  const spanStart = lines.slice(0, firstIndex).reduce((sum, line) => sum + line.length + 1, 0)
  const spanEnd = spanStart + (lines[firstIndex]?.length ?? 0) + 1 + (lines[firstIndex + 1]?.length ?? 0)
  replaceRange(textarea, spanStart, spanEnd, newLines.slice(firstIndex, firstIndex + 2).join('\n'))

  nextTick(() => {
    let newPos = 0
    for (let i = 0; i < targetIndex; i++) {
      const line = newLines[i]
      if (line !== undefined) {
        newPos += line.length + 1
      }
    }
    const currentTargetLine = newLines[targetIndex]
    if (currentTargetLine !== undefined) {
      const offsetInLine = selectionStart - currentPos
      const finalPos = newPos + Math.min(offsetInLine, currentTargetLine.length)
      textarea.focus()
      textarea.setSelectionRange(finalPos, finalPos)
      syncScroll()
    }
  })
}

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  const isD = e.code === 'KeyD' || e.key.toLowerCase() === 'd'
  const isX = e.code === 'KeyX' || e.key.toLowerCase() === 'x'
  const isUp = e.code === 'ArrowUp'
  const isDown = e.code === 'ArrowDown'
  const isModifier = (e.metaKey || e.ctrlKey || e.altKey) && e.shiftKey
  const isCmdOrCtrl = e.metaKey || e.ctrlKey
  const isAltShift = e.altKey && e.shiftKey

  if (isModifier && isD) {
    if (document.activeElement === textareaRef.value) {
      e.preventDefault()
      e.stopPropagation()
      duplicateCurrentLine()
    }
  }

  if (isAltShift && (isUp || isDown)) {
    if (document.activeElement === textareaRef.value) {
      e.preventDefault()
      e.stopPropagation()
      moveLine(isUp ? -1 : 1)
    }
  }

  if (isCmdOrCtrl && isX) {
    if (document.activeElement === textareaRef.value) {
      const textarea = textareaRef.value as HTMLTextAreaElement
      if (textarea.selectionStart === textarea.selectionEnd) {
        e.preventDefault()
        e.stopPropagation()
        cutCurrentLine()
      }
    }
  }
}
</script>

<template>
  <main v-if="store.activeNote" class="editor-container">
    <div class="title-row">
      <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
        <input 
          type="text" 
          :value="store.activeNote.title" 
          @input="handleTitleChange"
          class="title-input"
          placeholder="Note Title"
          :readonly="!store.isAuthenticated && !store.activeNote.isPublicEditable"
        />
        <div v-if="store.isAuthenticated" class="slug-row">
          <span class="slug-prefix">slug: /</span>
          <input 
            type="text" 
            :value="store.activeNote.slug || ''" 
            @input="handleSlugChange"
            class="slug-input"
            placeholder="custom-slug"
          />
        </div>
      </div>
      <div class="title-actions">
        <button 
          v-if="store.isAuthenticated && store.activeNote.isPublic"
          @click="togglePublicEditable" 
          class="public-toggle-btn" 
          :class="{ 'is-editable': store.activeNote.isPublicEditable }"
          :title="store.activeNote.isPublicEditable ? 'Disable Public Edits' : 'Enable Public Edits'"
        >
          {{ store.activeNote.isPublicEditable ? 'Edits Allowed' : 'Read Only' }}
        </button>
        <button 
          v-if="store.isAuthenticated"
          @click="togglePublic" 
          class="public-toggle-btn" 
          :class="{ 'is-public': store.activeNote.isPublic }"
          :title="store.activeNote.isPublic ? 'Make Private' : 'Make Public'"
        >
          {{ store.activeNote.isPublic ? 'Public' : 'Private' }}
        </button>
        <button 
          v-if="!store.isAuthenticated"
          @click="store.toggleTheme" 
          class="copy-link-btn" 
          :title="`Current theme: ${store.theme}`"
          :class="store.theme"
        >
          <svg v-if="store.theme === 'dark'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          <svg v-else-if="store.theme === 'pink'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          <svg v-else-if="store.theme === 'orange'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>
          <svg v-else-if="store.theme === 'banana'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.88-1.59 3.29-3.35 4.24-5.27 1.71-3.41 1.71-6.73 0-10.14L15 4.41l-.41.59c-1.71 3.41-1.71 6.73 0 10.14.95 1.92 2.36 3.68 4.24 5.27l.17.53H12v-1z"></path><path d="M12 21.47V22"></path><path d="M9.17 15.67c-1.71-3.41-1.71-6.73 0-10.14L10 4.41l.41.59c1.71 3.41 1.71 6.73 0 10.14-.95 1.92-2.36 3.68-4.24 5.27l-.17.53H12v-1c-1.88-1.59-3.29-3.35-4.24-5.27z"></path></svg>
          <svg v-else-if="store.theme === 'sea'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1"></path><path d="M2 12c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1"></path><path d="M2 18c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1"></path></svg>
          <svg v-else-if="store.theme === 'colorful'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M3 5h4"></path><path d="M21 17v4"></path><path d="M19 19h4"></path></svg>
          <svg v-else-if="store.theme === 'forest'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"></path><path d="M9 11 12 7l3 4Z"></path><path d="M7 15 12 9l5 6Z"></path><path d="M5 19 12 11l7 8Z"></path></svg>
          <svg v-else-if="store.theme === 'desert'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10V2"></path><path d="m4.93 10.93 1.41-1.41"></path><path d="M2 18h2"></path><path d="m20 18 2 2"></path><path d="m19.07 10.93-1.41-1.41"></path><path d="M22 22H2"></path><path d="M8 22a4 4 0 0 1 8 0"></path></svg>
          <svg v-else-if="store.theme === 'nordic'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"></path><line x1="8" y1="16" x2="8.01" y2="16"></line><line x1="12" y1="18" x2="12.01" y2="18"></line><line x1="16" y1="16" x2="16.01" y2="16"></line></svg>
          <svg v-else-if="store.theme === 'deep-space'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="2"></circle><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M2 12h4"></path><path d="M18 12h4"></path></svg>
          <svg v-else-if="store.theme === 'sepia'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          <svg v-else-if="store.theme === 'hacker'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
          <svg v-else-if="store.theme === 'cyberpunk'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect></svg>
          <svg v-else-if="store.theme === 'crt'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          <svg v-else-if="store.theme === 'espresso'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"></path><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path></svg>
          <svg v-else-if="store.theme === 'matcha'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8a3 3 0 0 0 3 3"></path></svg>
          <svg v-else-if="store.theme === 'grape'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>
          <svg v-else-if="store.theme === 'slate'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
          <svg v-else-if="store.theme === 'dracula'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z"></path><circle cx="9" cy="10" r="1"></circle><circle cx="15" cy="10" r="1"></circle><path d="M8 15c1 1 2.5 1.5 4 1.5s3-.5 4-1.5"></path></svg>
          <svg v-else-if="store.theme === 'paper'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          <svg v-else-if="store.theme === 'unicorn'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path></svg>
          <svg v-else-if="store.theme === 'batman'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c-1 0-2 .5-3 1.5C8 4.5 7 6 7 8c0 3 2 5 5 5s5-2 5-5c0-2-1-3.5-2-4.5C14 2.5 13 2 12 2z"></path></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        </button>
        <button 
          @click="copyLink" 
          class="copy-link-btn" 
          :title="copyFeedback ? 'Copied!' : 'Copy Link'"
          :class="{ 'copy-success': copyFeedback }"
        >
          <svg v-if="!copyFeedback" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
      </div>
    </div>
    
    <div v-if="conflict" class="conflict-banner" role="alert">
      <span>This note was changed in another window. Your edits here are not saved yet.</span>
      <div class="conflict-actions">
        <button @click="store.loadLatest(conflict.id)" title="Discard your edits and show the other window's version">Load latest</button>
        <button @click="store.keepMine(conflict.id)" class="keep-mine" title="Overwrite the other window's version with yours">Keep mine</button>
      </div>
    </div>

    <div class="editor-wrapper">
      <div class="line-numbers" ref="lineNumbersRef">
        <div
          v-for="n in lineNumbers"
          :key="n"
          class="line-number"
          :style="lineHeights[n - 1] ? { height: `${lineHeights[n - 1]}px` } : undefined"
        >{{ n }}</div>
      </div>
      <textarea 
        ref="textareaRef"
        :value="store.activeNote.content" 
        @input="handleContentChange"
        @scroll="syncScroll"
        class="content-area"
        placeholder="Start writing..."
        :readonly="!store.isAuthenticated && !store.activeNote.isPublicEditable"
      ></textarea>
    </div>

    <div class="status-bar">
      <template v-if="store.isAuthenticated">
        <button @click="$emit('openDeleteModal')" class="delete-btn">Delete Note</button>
        <span style="flex: 1"></span>
        <span :class="{ 'status-warning': conflict }">{{ saveStatus }}</span>
        <button @click="store.logout" class="logout-btn">Logout</button>
      </template>
      <template v-else>
        <span class="public-badge" :class="{ 'editable': store.activeNote.isPublicEditable }">
          {{ store.activeNote.isPublicEditable ? 'Public View (Editable)' : 'Public View (Read-Only)' }}
        </span>
        <span style="flex: 1"></span>
        <span v-if="store.activeNote.isPublicEditable" :class="{ 'status-warning': conflict }">{{ saveStatus }}</span>
        <button @click="store.isAuthenticated = false; store.publicNote = null; store.activeNoteId = null" class="logout-btn">Back to Login</button>
      </template>
    </div>
  </main>
  
  <div v-else class="editor-container" style="justify-content: center; align-items: center; color: var(--text-muted);">
    <p>Select a note or create a new one to get started.</p>
  </div>
</template>
