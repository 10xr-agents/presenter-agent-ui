/**
 * Toast notification utilities
 * Wrapper around sonner for consistent toast usage
 */

import { toast as sonnerToast } from "sonner"

export const toast = {
  /**
   * Show a success toast
   */
  success: (message: string, description?: string) => {
    return sonnerToast.success(message, {
      description,
    })
  },

  /**
   * Show an error toast
   */
  error: (message: string, description?: string) => {
    return sonnerToast.error(message, {
      description,
    })
  },

  /**
   * Show an info toast
   */
  info: (message: string, description?: string) => {
    return sonnerToast.info(message, {
      description,
    })
  },

  /**
   * Show a warning toast
   */
  warning: (message: string, description?: string) => {
    return sonnerToast.warning(message, {
      description,
    })
  },

  /**
   * Show a loading toast (returns a function to update/dismiss)
   */
  loading: (message: string) => {
    return sonnerToast.loading(message)
  },

  /**
   * Show a promise toast (handles loading, success, error states)
   */
  promise: <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: unknown) => string)
    }
  ) => {
    return sonnerToast.promise(promise, {
      loading,
      success,
      error,
    })
  },

  /**
   * Dismiss a toast by ID
   */
  dismiss: (toastId?: string | number) => {
    sonnerToast.dismiss(toastId)
  },
}
