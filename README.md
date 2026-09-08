# My Portfolio Website <callout icon="♞">**Status:** Live · **Owner:** Sam Ananias Cases</callout>

Welcome! This is the project behind my personal portfolio website.

**You can visit the live website here: [samananias.is-a.dev](https://samananias.is-a.dev)**

If you have never worked with websites before, don't worry. This page explains everything in plain language.

---

## What is this website, in one sentence?

Think of it as my **digital showcase and resume**: instead of handing someone a paper CV, I send them this website, where visitors can read about my background, explore the projects I have built, and even play a game of chess with me.

## What can you find on the site?

Visit [samananias.is-a.dev](https://samananias.is-a.dev) to explore:

| Page           | What it's for                                                                                        |
| :------------- | :--------------------------------------------------------------------------------------------------- |
| **Home**       | A friendly welcome and a quick tour of everything else.                                              |
| **About**      | Who I am, what I do, and how I work.                                                                 |
| **Work**       | Real projects explained honestly — what I built, why, and what I learned.                            |
| **Experience** | My work history and certifications.                                                                  |
| **Posts**      | Articles and notes about things I am learning.                                                       |
| **Contact**    | A simple form to send a message directly to me.                                                      |
| **Live Chat**  | A small chat room where anyone can say hello — no account needed.                                    |
| **Chess Game** | A shared chess board that every visitor plays on together. Your moves are saved for everyone to see. |

## Projects currently on the Work page

The **Work** page is a living catalog of real projects, each with an honest write-up of what was built and why. Right now it includes:

- **BITS — Biometrics Integrated Timekeeping System** — a full-stack attendance platform that connects physical biometric devices to automated shift calculations.
- **Portfolio Architecture & Content System** — this very website: how it is built, and the engineering rules that keep it fast and accessible.
- **PrinterService** — a self-hosted Python print server that turns a USB-only inkjet into a wireless printer for every phone and laptop on the home Wi-Fi.

## How is the website built? (Plain-language version)

Every website is a set of instructions that a computer turns into the pages you see. Here are the main "ingredients" of this one, without the jargon:

- **Astro** — the construction tool. It assembles all the pages of the site quickly, so they load fast for visitors.
- **React** — used for the _interactive_ parts, like the chat and the chess board, where things need to respond when you click.
- **TypeScript** — a careful way of writing the instructions so mistakes are caught early, like a spell-checker for code.
- **Tailwind CSS** — the "paint and layout" layer that decides colors, spacing, and how everything looks on phones and computers.
- **Cloudflare** — the service that hosts the finished site and delivers it quickly to visitors anywhere in the world.

That's the whole recipe. Nothing here is magic — it's just carefully written instructions.

## Questions or feedback?

The best way to reach me is through the **Contact** page on the website, or by email at [samananiascases@gmail.com](mailto:samananiascases@gmail.com).

## For developers

This project uses Astro with server-side rendering on Cloudflare, React 19 for interactive islands, Tailwind CSS v4 (CSS-first configuration), and TypeScript in strict mode. Package management is `pnpm` — please don't use `npm` or `yarn`.

Full engineering documentation lives in [`/docs`](docs/README.md), including the architecture guide, design system, coding standards, and feature plans.
