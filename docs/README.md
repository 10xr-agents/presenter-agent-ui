# Documentation Index

This directory contains comprehensive documentation for the Screen Agent Platform, organized into three main reference documents.

## Core Documentation

The documentation has been consolidated into three comprehensive guides:

### 1. [ARCHITECTURE.md](./ARCHITECTURE.md)
**System Architecture & Design**

Complete system architecture documentation including:
- System Overview & Architecture Patterns
- Technology Stack
- Database Architecture (MongoDB, Prisma, Mongoose)
- Authentication & Authorization
- Multi-Tenancy & Organizations
- API Architecture
- Knowledge Extraction System
- S3 File Storage Architecture
- Browser Automation Service
- Background Processing (BullMQ, Redis)
- External Services Integration
- Security Architecture
- Deployment Architecture

### 2. [DEVELOPMENT.md](./DEVELOPMENT.md)
**Development Guide, Testing & UI/UX Standards**

Complete development guide including:
- Getting Started & Prerequisites
- Development Environment Setup
- Code Standards & TypeScript Rules
- Logging & Sentry Integration
- Testing Strategy & Frameworks
- UI/UX Design System (Shadcn UI)
- Typography, Spacing, Color System
- Component Patterns & Templates
- Universal Patterns (Lists, Details, Forms)
- Quality Standards & Compliance Checklists
- Common Tasks & Troubleshooting
- Authentication Setup (Google OAuth)

### 3. [API_REFERENCE.md](./API_REFERENCE.md)
**API Reference & Feature Documentation**

Complete API and feature documentation including:
- Core Features & APIs (Screen Agents, Presentations, Analytics, Billing)
- Knowledge Extraction API (Complete REST API specification)
- Browser Automation Service
- Authentication & OAuth
- Comprehensive Testing Coverage (by feature and priority)

## Quick Start

**New to the project?** Start here:
1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
2. Follow [DEVELOPMENT.md](./DEVELOPMENT.md) for setup and development standards
3. Review [API_REFERENCE.md](./API_REFERENCE.md) for feature and API details

**Working on a specific area?**
- **Architecture & System Design**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Development & Code Standards**: [DEVELOPMENT.md](./DEVELOPMENT.md)
- **Features & APIs**: [API_REFERENCE.md](./API_REFERENCE.md)

## Documentation Structure

```
docs/
├── README.md                    # This file
├── ARCHITECTURE.md              # System architecture & design
├── DEVELOPMENT.md               # Development, testing & UI/UX
├── API_REFERENCE.md             # Features & API documentation
└── openapi.json                 # OpenAPI specification
```

## Documentation by Topic

### Architecture & Design
- **System Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) - Complete system design, patterns, and architecture decisions
- **Database Design**: [ARCHITECTURE.md](./ARCHITECTURE.md) - MongoDB, Prisma, Mongoose patterns
- **S3 Storage**: [ARCHITECTURE.md](./ARCHITECTURE.md) - S3 file storage architecture
- **Browser Automation**: [ARCHITECTURE.md](./ARCHITECTURE.md) - Browser automation service protocols

### Development & Standards
- **Setup & Environment**: [DEVELOPMENT.md](./DEVELOPMENT.md) - Getting started, prerequisites, environment setup
- **Code Standards**: [DEVELOPMENT.md](./DEVELOPMENT.md) - TypeScript rules, component structure, API patterns
- **Testing**: [DEVELOPMENT.md](./DEVELOPMENT.md) - Testing strategy, frameworks, test coverage
- **UI/UX Guidelines**: [DEVELOPMENT.md](./DEVELOPMENT.md) - Complete design system, Shadcn UI, component patterns

### Features & APIs
- **Core Features**: [API_REFERENCE.md](./API_REFERENCE.md) - Screen Agents, Presentations, Analytics, Billing
- **Knowledge Extraction API**: [API_REFERENCE.md](./API_REFERENCE.md) - Complete REST API specification
- **Browser Automation Service**: [API_REFERENCE.md](./API_REFERENCE.md) - Service protocols and interfaces
- **Testing Coverage**: [API_REFERENCE.md](./API_REFERENCE.md) - Comprehensive test cases by feature

## Contributing to Documentation

When adding or updating documentation:

1. **Place in correct file**: Use the three main documents (ARCHITECTURE.md, DEVELOPMENT.md, API_REFERENCE.md)
2. **Update this README**: If adding new major sections
3. **Cross-reference**: Link to related sections within the same document or other documents
4. **Keep organized**: Follow existing structure and formatting
5. **Maintain consolidation**: Avoid creating new separate documentation files unless absolutely necessary

## Questions?

- **Architecture questions**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Development questions**: See [DEVELOPMENT.md](./DEVELOPMENT.md)
- **Feature/API questions**: See [API_REFERENCE.md](./API_REFERENCE.md)
