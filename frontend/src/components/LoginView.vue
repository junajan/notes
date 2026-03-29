<script setup lang="ts">
import { ref } from 'vue'
import { useNoteStore } from '../stores/noteStore'

const store = useNoteStore()
const password = ref('')
const isLoggingIn = ref(false)

const handleLogin = async () => {
  if (!password.value) return
  isLoggingIn.value = true
  const success = await store.login(password.value)
  if (success) {
    password.value = ''
  }
  isLoggingIn.value = false
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h1>Online Notes</h1>
      <p>Please enter your password to access your notes.</p>
      <form @submit.prevent="handleLogin">
        <input 
          type="password" 
          v-model="password" 
          placeholder="Password"
          class="password-input"
          autocomplete="off"
          data-1p-ignore
          autofocus
        />
        <button type="submit" :disabled="isLoggingIn" class="btn btn-primary login-btn">
          {{ isLoggingIn ? 'Logging in...' : 'Login' }}
        </button>
        <p v-if="store.error" class="error-text">{{ store.error }}</p>
      </form>
    </div>
  </div>
</template>
