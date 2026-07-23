import { z } from 'zod'

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Workspace name is too short').max(60),
  industry: z.string().trim().max(60).optional(),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
