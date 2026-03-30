<script setup lang="ts">
import { useNoteStore } from '../stores/noteStore'
import draggable from 'vuedraggable'

defineProps<{
  isMobile: boolean
}>()

const store = useNoteStore()

const addNewNote = () => {
  store.createNote('New Note')
}

const onDragEnd = () => {
  store.reorderNotes()
}
</script>

<template>
  <div v-if="store.isAuthenticated" class="tabs-wrapper">
    <draggable 
      v-model="store.notes" 
      item-key="id" 
      class="tab-bar"
      :disabled="isMobile"
      @end="onDragEnd"
      animation="200"
    >
      <template #item="{ element: note }">
        <button 
          :class="['tab', { active: store.activeNoteId === note.id }]"
          @click="store.activeNoteId = note.id"
        >
          {{ note.title || 'Untitled' }}
          <svg v-if="note.isPublic" class="public-indicator" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </button>
      </template>
    </draggable>
    <div class="tab-actions">
      <button @click="store.toggleTheme" class="theme-toggle" :title="`Current theme: ${store.theme}`" :class="store.theme">
        <svg v-if="store.theme === 'dark'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        <svg v-else-if="store.theme === 'pink'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <svg v-else-if="store.theme === 'orange'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>
        <svg v-else-if="store.theme === 'banana'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.88-1.59 3.29-3.35 4.24-5.27 1.71-3.41 1.71-6.73 0-10.14L15 4.41l-.41.59c-1.71 3.41-1.71 6.73 0 10.14.95 1.92 2.36 3.68 4.24 5.27l.17.53H12v-1z"></path><path d="M12 21.47V22"></path><path d="M9.17 15.67c-1.71-3.41-1.71-6.73 0-10.14L10 4.41l.41.59c1.71 3.41 1.71 6.73 0 10.14-.95 1.92-2.36 3.68-4.24 5.27l-.17.53H12v-1c-1.88-1.59-3.29-3.35-4.24-5.27z"></path></svg>
        <svg v-else-if="store.theme === 'sea'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1"></path><path d="M2 12c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1"></path><path d="M2 18c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1c.6.5 1.2 1 2.5 1s2.5-.5 3-1c.6-.5 1.2-1 2.5-1s2.5.5 3 1"></path></svg>
        <svg v-else-if="store.theme === 'colorful'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M3 5h4"></path><path d="M21 17v4"></path><path d="M19 19h4"></path></svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
      </button>
      <button @click="addNewNote" class="add-tab" title="Add New Note">+</button>
    </div>
  </div>
</template>
