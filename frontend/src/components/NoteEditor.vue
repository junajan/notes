<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useNoteStore } from '../stores/noteStore'

const store = useNoteStore()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumbersRef = ref<HTMLDivElement | null>(null)
const copyFeedback = ref(false)
const slugCopyFeedback = ref(false)

defineEmits(['openDeleteModal', 'openClearAllModal'])

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
})

const lineNumbers = computed(() => {
  const lines = (store.activeNote?.content || '').split('\n').length
  return Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1)
})

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

const copySlugLink = async () => {
  if (!store.activeNote?.slug) return
  try {
    const url = window.location.origin + '/' + store.activeNote.slug
    await navigator.clipboard.writeText(url)
    slugCopyFeedback.value = true
    setTimeout(() => {
      slugCopyFeedback.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy slug link: ', err)
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
  const newValue = value.substring(0, lineEnd) + '\n' + lineContent + value.substring(lineEnd)

  store.updateNote(store.activeNoteId, { content: newValue })
  
  nextTick(() => {
    const offset = lineContent.length + 1
    textarea.focus()
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
  
  let lineToCut = ''
  let newValue = ''
  let newCursorPos = lineStart

  if (lineEnd === -1) {
    lineToCut = value.substring(lineStart)
    newValue = value.substring(0, lineStart)
    if (lineStart > 0 && newValue.endsWith('\n')) {
        newValue = newValue.slice(0, -1)
        newCursorPos = Math.max(0, lineStart - 1)
    }
  } else {
    lineToCut = value.substring(lineStart, lineEnd + 1)
    newValue = value.substring(0, lineStart) + value.substring(lineEnd + 1)
    newCursorPos = lineStart
  }

  try {
    await navigator.clipboard.writeText(lineToCut.endsWith('\n') ? lineToCut.slice(0, -1) : lineToCut)
    store.updateNote(store.activeNoteId, { content: newValue })
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
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

  const newValue = newLines.join('\n')
  store.updateNote(store.activeNoteId, { content: newValue })

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
          <button 
            v-if="store.activeNote.slug"
            @click="copySlugLink" 
            class="copy-slug-btn" 
            :class="{ 'copy-success': slugCopyFeedback }"
            :title="slugCopyFeedback ? 'Copied!' : 'Copy Slug Link'"
          >
            <svg v-if="!slugCopyFeedback" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
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
          @click="copyLink" 
          class="copy-link-btn" 
          :title="copyFeedback ? 'Copied!' : 'Copy Link'"
          :class="{ 'copy-success': copyFeedback }"
        >
          <svg v-if="!copyFeedback" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
      </div>
    </div>
    
    <div class="editor-wrapper">
      <div class="line-numbers" ref="lineNumbersRef">
        <div v-for="n in lineNumbers" :key="n" class="line-number">{{ n }}</div>
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
        <button @click="$emit('openClearAllModal')" class="clear-all-btn">Clear All Notes</button>
        <span style="flex: 1"></span>
        <span>{{ store.isSaving ? 'Saving...' : 'All changes saved' }}</span>
        <button @click="store.logout" class="logout-btn">Logout</button>
      </template>
      <template v-else>
        <span class="public-badge" :class="{ 'editable': store.activeNote.isPublicEditable }">
          {{ store.activeNote.isPublicEditable ? 'Public View (Editable)' : 'Public View (Read-Only)' }}
        </span>
        <span style="flex: 1"></span>
        <span v-if="store.activeNote.isPublicEditable">{{ store.isSaving ? 'Saving...' : 'All changes saved' }}</span>
        <button @click="store.isAuthenticated = false; store.publicNote = null; store.activeNoteId = null" class="logout-btn">Back to Login</button>
      </template>
    </div>
  </main>
  
  <div v-else class="editor-container" style="justify-content: center; align-items: center; color: var(--text-muted);">
    <p>Select a note or create a new one to get started.</p>
    <button @click="$emit('openClearAllModal')" v-if="store.notes.length > 0" class="clear-all-btn" style="margin-top: 1rem;">Clear All Notes</button>
  </div>
</template>
