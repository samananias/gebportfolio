import { config, fields, collection, singleton } from "@keystatic/core";

export default config({
  storage: {
    kind: "local",
  },
  singletons: {
    site: singleton({
      label: "Site Config",
      path: ".keystatic/data/site",
      format: "json",
      schema: {
        name: fields.text({ label: "Site Name" }),
        titleTemplate: fields.text({ label: "Title Template" }),
        description: fields.text({ label: "Description", multiline: true }),
        canonicalURL: fields.text({ label: "Canonical URL" }),
        locale: fields.text({ label: "Locale" }),
        socialLinks: fields.array(
          fields.object({
            platform: fields.text({ label: "Platform" }),
            url: fields.text({ label: "URL" }),
            label: fields.text({ label: "Label" }),
          }),
          {
            label: "Social Links",
            itemLabel: (props) => props.fields.label.value || "Social Link",
          }
        ),
        defaultImage: fields.text({ label: "Default Image Path" }),
        contactSettings: fields.object({
          email: fields.text({ label: "Contact Email" }),
          formEndpoint: fields.text({ label: "Form Endpoint (Optional)" }),
        }),
      },
    }),
    navigation: singleton({
      label: "Navigation Links",
      path: ".keystatic/data/navigation",
      format: "json",
      schema: {
        links: fields.array(
          fields.object({
            label: fields.text({ label: "Label" }),
            href: fields.text({ label: "Href" }),
            visibility: fields.checkbox({ label: "Visible", defaultValue: true }),
            external: fields.checkbox({ label: "External", defaultValue: false }),
          }),
          {
            label: "Links",
            itemLabel: (props) => props.fields.label.value || "Link",
          }
        ),
      },
    }),
  },
  collections: {
    projects: collection({
      label: "Projects",
      slugField: "title",
      path: "src/content/projects/*",
      format: { contentField: "content" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        summary: fields.text({ label: "Summary", multiline: true }),
        role: fields.text({ label: "Role" }),
        dates: fields.text({ label: "Dates (e.g. Present)" }),
        status: fields.select({
          label: "Status",
          options: [
            { label: "Planning", value: "planning" },
            { label: "Active", value: "active" },
            { label: "Completed", value: "completed" },
            { label: "Archived", value: "archived" },
          ],
          defaultValue: "planning",
        }),
        featured: fields.checkbox({ label: "Featured", defaultValue: false }),
        stackRefs: fields.array(fields.text({ label: "Skill ID/Ref" }), {
          label: "Stack References",
          itemLabel: (props) => props.value,
        }),
        tags: fields.array(fields.text({ label: "Tag" }), {
          label: "Tags",
          itemLabel: (props) => props.value,
        }),
        heroImage: fields.text({ label: "Hero Image (Path)" }),
        links: fields.array(
          fields.object({
            label: fields.text({ label: "Label" }),
            url: fields.text({ label: "URL" }),
          }),
          {
            label: "Links",
            itemLabel: (props) => props.fields.label.value || "Link",
          }
        ),
        outcomes: fields.array(fields.text({ label: "Outcome" }), {
          label: "Outcomes",
          itemLabel: (props) => props.value,
        }),
        content: fields.document({
          label: "Content",
          formatting: true,
          links: true,
          images: true,
        }),
        seo: fields.object({
          title: fields.text({ label: "SEO Title" }),
          description: fields.text({ label: "SEO Description", multiline: true }),
          image: fields.text({ label: "SEO Image Path" }),
        }),
      },
    }),
    posts: collection({
      label: "Posts (Blog)",
      slugField: "title",
      path: "src/content/posts/*",
      format: { contentField: "content" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        excerpt: fields.text({ label: "Excerpt", multiline: true }),
        publishedDate: fields.date({ label: "Published Date" }),
        updatedDate: fields.date({ label: "Updated Date" }),
        draft: fields.checkbox({ label: "Draft", defaultValue: false }),
        tags: fields.array(fields.text({ label: "Tag" }), {
          label: "Tags",
          itemLabel: (props) => props.value,
        }),
        cover: fields.text({ label: "Cover Image Path" }),
        content: fields.document({
          label: "Content",
          formatting: true,
          links: true,
          images: true,
        }),
        seo: fields.object({
          title: fields.text({ label: "SEO Title" }),
          description: fields.text({ label: "SEO Description", multiline: true }),
          image: fields.text({ label: "SEO Image Path" }),
        }),
      },
    }),
    experience: collection({
      label: "Experience",
      slugField: "organization",
      path: "src/content/experience/*",
      format: "yaml",
      schema: {
        organization: fields.slug({ name: { label: "Organization" } }),
        role: fields.text({ label: "Role" }),
        start: fields.text({ label: "Start Date (e.g. 2024-01)" }),
        end: fields.text({ label: "End Date (e.g. 2024-06, leave blank for Present)" }),
        location: fields.text({ label: "Location" }),
        summary: fields.text({ label: "Summary", multiline: true }),
        achievements: fields.array(fields.text({ label: "Achievement" }), {
          label: "Achievements",
          itemLabel: (props) => props.value,
        }),
        skills: fields.array(fields.text({ label: "Skill ID/Ref" }), {
          label: "Skills Reference",
          itemLabel: (props) => props.value,
        }),
        order: fields.number({ label: "Display Order", defaultValue: 0 }),
      },
    }),
    skills: collection({
      label: "Skills",
      slugField: "name",
      path: "src/content/skills/*",
      format: "yaml",
      schema: {
        name: fields.slug({ name: { label: "Name" } }),
        category: fields.text({ label: "Category" }),
        proficiencyEvidence: fields.text({ label: "Proficiency Evidence", multiline: true }),
        years: fields.number({ label: "Years of Experience (Optional)" }),
        iconKey: fields.text({ label: "Icon Key (Optional)" }),
        order: fields.number({ label: "Display Order", defaultValue: 0 }),
      },
    }),
    achievements: collection({
      label: "Achievements",
      slugField: "title",
      path: "src/content/achievements/*",
      format: "yaml",
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        issuer: fields.text({ label: "Issuer" }),
        date: fields.date({ label: "Date" }),
        evidenceURL: fields.text({ label: "Evidence URL (Optional)" }),
        description: fields.text({ label: "Description", multiline: true }),
        featured: fields.checkbox({ label: "Featured", defaultValue: false }),
      },
    }),
    research: collection({
      label: "Research Publications",
      slugField: "title",
      path: "src/content/research/*",
      format: { contentField: "content" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        abstract: fields.text({ label: "Abstract", multiline: true }),
        status: fields.select({
          label: "Status",
          options: [
            { label: "In Progress", value: "in_progress" },
            { label: "Submitted", value: "submitted" },
            { label: "Published", value: "published" },
            { label: "Archived", value: "archived" },
          ],
          defaultValue: "in_progress",
        }),
        date: fields.date({ label: "Publication Date" }),
        collaborators: fields.array(fields.text({ label: "Collaborator" }), {
          label: "Collaborators",
          itemLabel: (props) => props.value,
        }),
        publicationLinks: fields.array(
          fields.object({
            label: fields.text({ label: "Label" }),
            url: fields.text({ label: "URL" }),
          }),
          {
            label: "Publication Links",
            itemLabel: (props) => props.fields.label.value || "Link",
          }
        ),
        content: fields.document({
          label: "Main Body Content",
          formatting: true,
          links: true,
          images: true,
        }),
        seo: fields.object({
          title: fields.text({ label: "SEO Title" }),
          description: fields.text({ label: "SEO Description", multiline: true }),
        }),
      },
    }),
    experiments: collection({
      label: "Experiments (Lab)",
      slugField: "title",
      path: "src/content/experiments/*",
      format: { contentField: "content" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        status: fields.select({
          label: "Status",
          options: [
            { label: "Active", value: "active" },
            { label: "Completed", value: "completed" },
            { label: "Abandoned", value: "abandoned" },
          ],
          defaultValue: "active",
        }),
        warning: fields.text({ label: "Warning / Disclaimer (Optional)", multiline: true }),
        technologies: fields.array(fields.text({ label: "Technology" }), {
          label: "Technologies Used",
          itemLabel: (props) => props.value,
        }),
        demoLinks: fields.array(
          fields.object({
            label: fields.text({ label: "Label" }),
            url: fields.text({ label: "URL" }),
          }),
          {
            label: "Demo Links",
            itemLabel: (props) => props.fields.label.value || "Link",
          }
        ),
        content: fields.document({
          label: "Main Body Content",
          formatting: true,
          links: true,
          images: true,
        }),
      },
    }),
    pages: collection({
      label: "Pages Content",
      slugField: "title",
      path: "src/content/pages/*",
      format: "json",
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        sections: fields.array(
          fields.object({
            id: fields.text({ label: "Section ID" }),
            heading: fields.text({ label: "Heading" }),
            content: fields.text({ label: "Content", multiline: true }),
            order: fields.number({ label: "Order", defaultValue: 0 }),
          }),
          {
            label: "Sections",
            itemLabel: (props) => props.fields.id.value || "Section",
          }
        ),
      },
    }),
  },
});
