import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob, file } from "astro/loaders";

// 1. Site Singleton Schema
const site = defineCollection({
  loader: file("src/content/data/site.json"),
  schema: z.object({
    name: z.string(),
    titleTemplate: z.string(),
    headline: z.string().optional(),
    location: z.string().optional(),
    description: z.string(),
    canonicalURL: z.string().url(),
    locale: z.string(),
    socialLinks: z.array(
      z.object({
        platform: z.string(),
        url: z.string().url(),
        label: z.string(),
      })
    ),
    defaultImage: z.string(),
    contactSettings: z.object({
      email: z.string().email(),
      formEndpoint: z.string().optional(),
    }),
  }),
});

// 2. Navigation Singleton Schema
const navigation = defineCollection({
  loader: file("src/content/data/navigation.json"),
  schema: z.object({
    links: z.array(
      z.object({
        label: z.string(),
        href: z.string(),
        visibility: z.boolean().default(true),
        external: z.boolean().default(false),
      })
    ),
  }),
});

// 3. Projects Schema
const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    role: z.string(),
    dates: z.string(),
    status: z.enum(["planning", "active", "completed", "archived"]),
    featured: z.boolean().default(false),
    stackRefs: z.array(z.string()).default([]), // References to skills
    tags: z.array(z.string()).default([]),
    heroImage: z.string().optional(),
    chessPiece: z.enum(["king", "queen", "knight"]).optional(),
    chessRoleReason: z.string().optional(),
    keyTakeaway: z.string().optional(),
    category: z.enum(["architecture", "systems", "web", "tools"]).default("web"),
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().url(),
        })
      )
      .optional(),
    outcomes: z.array(z.string()).optional(),
    seo: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        image: z.string().optional(),
      })
      .optional(),
  }),
});

// 4. Posts Schema (Blog)
const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    publishedDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    seo: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        image: z.string().optional(),
      })
      .optional(),
  }),
});

// 5. Experience Schema
const experience = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/experience" }),
  schema: z.object({
    organization: z.string(),
    role: z.string(),
    type: z
      .enum([
        "fulltime",
        "contract",
        "internship",
        "freelance",
        "academic",
        "project",
        "leadership",
      ])
      .default("project"),
    start: z.string(), // e.g. "2024-01"
    end: z.string().optional(), // empty/null represents Present
    location: z.string(),
    summary: z.string(),
    achievements: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    order: z.number().default(0),
  }),
});

// 6. Skills Schema
const skills = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/skills" }),
  schema: z.object({
    name: z.string(),
    category: z.string(),
    proficiencyEvidence: z.string(),
    years: z.number().optional(),
    iconKey: z.string().optional(),
    order: z.number().default(0),
  }),
});

// 7. Achievements Schema
const achievements = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/achievements" }),
  schema: z.object({
    title: z.string(),
    issuer: z.string(),
    date: z.coerce.date(),
    evidenceURL: z.string().url().optional(),
    description: z.string(),
    featured: z.boolean().default(false),
  }),
});

// 8. Research Schema
const research = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/research" }),
  schema: z.object({
    title: z.string(),
    abstract: z.string(),
    status: z.enum(["in_progress", "submitted", "published", "archived"]),
    date: z.coerce.date(),
    collaborators: z.array(z.string()).default([]),
    publicationLinks: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().url(),
        })
      )
      .optional(),
    seo: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
      })
      .optional(),
  }),
});

// 9. Experiments Schema
const experiments = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/experiments" }),
  schema: z.object({
    title: z.string(),
    status: z.enum(["active", "completed", "abandoned"]),
    summary: z.string().optional(), // 1-2 sentence field note shown as the entry lede
    objectives: z.array(z.string()).default([]), // what the entry set out to test
    keyTakeaway: z.string().optional(), // bottom-line conclusion stamped at the record's end
    warning: z.string().optional(),
    technologies: z.array(z.string()).default([]),
    demoLinks: z
      .array(
        z.object({
          label: z.string(),
          // Absolute http(s) links open off-site; root-relative paths (e.g.
          // "/crop") resolve against the serving host, so they stay correct
          // on localhost, preview deploys, and production alike.
          url: z
            .string()
            .refine(
              (value) => /^https?:\/\//i.test(value) || value.startsWith("/"),
              "url must be an absolute http(s) URL or a root-relative path (e.g. /crop)"
            ),
        })
      )
      .optional(),
  }),
});

// 10. Pages Singleton Schema (About, Contact, Landing section content)
const pages = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    sections: z
      .array(
        z.object({
          id: z.string(),
          heading: z.string().optional(),
          content: z.string(),
          order: z.number().optional(),
        })
      )
      .optional(),
    // About-page "Score Sheet" ledger (places the page in chess-notation moves)
    moves: z
      .array(
        z.object({
          id: z.string(),
          notation: z.string(), // SAN-style move glyph, e.g. "1.", "2.", "Nf3."
          piece: z.enum(["king", "queen", "rook", "bishop", "knight", "pawn"]).optional(),
          heading: z.string(),
          dateRange: z.string().optional(), // "2024 – Present"
          lead: z.string().optional(), // short thesis line in Fraunces
          body: z.array(z.string()), // paragraphs as separate entries
        })
      )
      .optional(),
    facts: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        })
      )
      .optional(),
  }),
});

export const collections = {
  site,
  navigation,
  projects,
  posts,
  experience,
  skills,
  achievements,
  research,
  experiments,
  pages,
};
