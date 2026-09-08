---
title: PrinterService — Self-Hosted Network Printing Bridge
summary: A FastAPI print server that turns a USB-only Epson inkjet into a wireless network printer, with a mobile web UI, multi-format PDF normalization, and a durable SQLite job engine.
role: Creator & Maintainer
dates: "2026"
status: active
featured: false
category: systems
heroImage: /images/projects/printer-service/hero.svg
keyTakeaway: "Key decision: Normalize every upload to PDF before it reaches the Windows print queue, so SumatraPDF and the vendor driver own all low-level USB communication."
stackRefs:
  - html-css
  - javascript
tags:
  - Python
  - FastAPI
  - SumatraPDF
  - SQLite
  - Pillow
  - LibreOffice
links:
  - label: GitHub Repository
    url: https://github.com/samananias/printerService
outcomes:
  - "Built a zero-install mobile printing flow: open a URL on the phone, pick a file, tap Print — no vendor cloud apps or mobile drivers."
  - "Normalized PDFs, images, Office documents, OpenDocument files, and plain text/CSV into print-ready PDFs through dedicated format processors."
  - "Added pre-flight hardware checks that query Windows spooler status flags (offline, out of paper, door open, jam) before dispatching jobs, preventing silent print failures."
  - "Implemented a durable job lifecycle with SQLite state tracking, one-click retry for failed jobs, and cancellation support."
  - "Covered the service with 190+ automated tests running against faked OS and spooler boundaries in CI, with a coverage gate."
seo:
  title: PrinterService — Self-Hosted Network Printing Bridge
  description: How a Python FastAPI service turns a USB-only Epson L3210 into a wireless network printer with a mobile web UI, PDF normalization, and a SQLite job engine.
---

### Project Overview

**PrinterService** is a lightweight, self-hosted printing service built with **Python** and **FastAPI**. It runs headless on an old, low-spec Windows PC and turns a USB-only printer (an Epson L3210 all-in-one) into a wireless network printer for every device on the home Wi-Fi — no manufacturer cloud services, vendor apps, or specialized mobile drivers required.

The problem it solves is a common one: entry-level desktop inkjets connect only via USB and have no built-in Wi-Fi. Mobile printing from a phone normally means proprietary manufacturer cloud apps, AirPrint/IPP hardware support, or fragile network workarounds. PrinterService fills that gap in software: the old PC pretends to be the smart, networked half of the printer.

### How It Works

A phone (or any browser on the LAN) opens the service's mobile-friendly web page and uploads a document. The service validates the file, standardizes it into a print-ready PDF, and silently submits it to the Windows print queue via **SumatraPDF**. Windows and the official Epson driver handle the low-level USB communication.

```text
Phone / Browser  ──Wi-Fi──►  FastAPI server (port 8000)
                               │  validation: magic bytes, size, PIN auth
                               │  normalization to PDF:
                               │    images (Pillow) · office (LibreOffice)
                               │    TXT/CSV (ReportLab) · PDF pass-through
                               ▼
                             Job engine (SQLite state tracking)
                               ▼
                             SumatraPDF CLI → Windows spooler → USB → paper
```

Every format funnels into one pipeline. PDFs pass through untouched; images are corrected for EXIF orientation, alpha transparency is composited onto white, and output is capped at 300 DPI; Office and OpenDocument files are converted through LibreOffice; text and CSV tables are rendered with ReportLab. One code path downstream means one place for print options, status tracking, and failure handling.

### Core Features

- **Zero-install mobile printing**: the phone's browser is the entire client. The page is a single self-contained HTML file — vanilla HTML/CSS/JS, no build step, no CDN calls — so it works even when the home internet is down but the LAN is fine.
- **Multi-format support**: PDF, JPG/PNG/WEBP/BMP/GIF/TIFF images, Microsoft Office and OpenDocument files, and plain text/CSV tables.
- **Configurable print options**: copies (1–99), page ranges (`2-6`, `odd`/`even`), paper sizes (A4, Letter, Legal, Long Bond, A3, A5), and color vs. monochrome.
- **Pre-flight hardware checks**: the Windows spooler is queried for status flags like `offline`, `out of paper`, `door open`, and `jam` before a job is dispatched, so failures surface as readable job states instead of silence.
- **Job lifecycle and recovery**: jobs move through `received → queued → converting → printing → done | failed | cancelled`, tracked durably in SQLite, with one-click retry and cancellation.
- **Scanner integration**: when a flatbed scanner is detected, a scan page sends pages back the other way as downloads; the UI degrades quietly when the hardware is absent.
- **LAN-only security**: private network profiles, optional shared PIN authentication for state-changing routes, strict file magic-byte validation, and process-tree cleanup.

### Tech Stack & Architecture

- **Backend**: Python 3.12, FastAPI, Uvicorn, served headless via Windows Task Scheduler
- **Format processors**: Pillow (images), LibreOffice (Office/OpenDocument), ReportLab (text/CSV), SumatraPDF (print submission)
- **State**: SQLite (`logs/jobs.sqlite3`) for durable job tracking
- **Frontend**: vanilla HTML/CSS/JS, a single self-contained page served by the API itself — mobile-first, self-hosted assets only
- **Hardware boundary**: Windows print spooler and the vendor driver own all USB communication

### Testing & Reliability

The service is covered by **190+ automated tests** (API and unit) that fake the OS and spooler boundaries, so the full suite runs in CI without a printer attached, gated on coverage in `pyproject.toml`. Alongside the test suite, standalone hardware diagnostic spikes (scan, print, image, and text spikes) verify real device behavior during development.
