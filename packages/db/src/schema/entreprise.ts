import { pgTable, serial, varchar, text } from 'drizzle-orm/pg-core'

export const entreprise = pgTable('entreprise', {
  identreprise: serial('identreprise').primaryKey(),
  nom: varchar('nom', { length: 100 }).notNull(),
  commentaire: text('commentaire'),
})
