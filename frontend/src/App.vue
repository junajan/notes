<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useNoteStore } from './stores/noteStore'
import LoginView from './components/LoginView.vue'
import NoteTabs from './components/NoteTabs.vue'
import NoteEditor from './components/NoteEditor.vue'
import ConfirmationModal from './components/ConfirmationModal.vue'

const store = useNoteStore()
const isMobile = ref(window.matchMedia('(max-width: 768px)').matches)
const showDeleteModal = ref(false)
const showClearAllModal = ref(false)

const updateMobileStatus = () => {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
}

onMounted(async () => {
  await store.checkAuth()
  
  const params = new URLSearchParams(window.location.search)
  const noteId = params.get('note')

  if (store.isAuthenticated) {
    await store.fetchNotes()
    if (noteId && store.notes.some(n => n.id === noteId)) {
      store.activeNoteId = noteId
    }
  } else if (noteId) {
    await store.fetchPublicNote(noteId)
  }
  
  window.addEventListener('resize', updateMobileStatus)
})

watch(() => store.activeNoteId, (newId) => {
  const url = new URL(window.location.href)
  if (newId) {
    url.searchParams.set('note', newId)
  } else {
    url.searchParams.delete('note')
  }
  window.history.replaceState({}, '', url.toString())
})

onUnmounted(() => {
  window.removeEventListener('resize', updateMobileStatus)
})

const confirmDelete = async () => {
  if (store.activeNoteId) {
    await store.deleteNote(store.activeNoteId)
    showDeleteModal.value = false
  }
}

const confirmClearAll = async () => {
  await store.deleteAllNotes()
  showClearAllModal.value = false
}
</script>

<template>
  <div v-if="store.isAuthenticated === null" class="login-container">
    <p>Loading...</p>
  </div>

  <LoginView v-else-if="!store.isAuthenticated && !store.activeNote" />

  <div v-else class="container">
    <NoteTabs :is-mobile="isMobile" />
    
    <NoteEditor 
      @open-delete-modal="showDeleteModal = true" 
      @open-clear-all-modal="showClearAllModal = true" 
    />

    <ConfirmationModal 
      :show="showDeleteModal"
      title="Delete Note"
      :message="`Are you sure you want to delete \&quot;${store.activeNote?.title || 'Untitled'}\&quot;? This action cannot be undone.`"
      confirm-text="Delete"
      is-danger
      @confirm="confirmDelete"
      @cancel="showDeleteModal = false"
    />

    <ConfirmationModal 
      :show="showClearAllModal"
      title="Clear All Notes"
      :message="`Are you sure you want to delete <strong>ALL</strong> ${store.notes.length} notes? This action is permanent and cannot be undone.`"
      confirm-text="Yes, Delete Everything"
      is-danger
      @confirm="confirmClearAll"
      @cancel="showClearAllModal = false"
    />
  </div>
</template>
