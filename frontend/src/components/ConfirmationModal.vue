<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
}>()

defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal-content">
        <h3 :style="isDanger ? 'color: #ef4444;' : ''">{{ title }}</h3>
        <p v-html="message"></p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="$emit('cancel')">{{ cancelText || 'Cancel' }}</button>
          <button 
            :class="['btn', isDanger ? 'btn-danger' : 'btn-primary']" 
            @click="$emit('confirm')"
          >
            {{ confirmText || 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
