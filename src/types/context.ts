/**
 * Application context types for Hono
 * Defines variables stored in context (c.set/c.get)
 */
export interface AppVariables {
  userId: string;
}

/**
 * Application context type
 * Use as: new Hono<AppContext>()
 */
export interface AppContext {
  Variables: AppVariables;
}
