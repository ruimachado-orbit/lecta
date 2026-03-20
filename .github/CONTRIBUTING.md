# Contributing to Lecta

Thank you for your interest in contributing to Lecta! This document outlines the guidelines for contributing to this project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create a branch** from `main` for your changes
4. **Install dependencies** with `pnpm install`
5. **Make your changes** and test them locally
6. **Push** your branch and open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/lecta.git
cd lecta

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

## Pull Request Process

1. **Branch naming**: Use descriptive branch names (e.g., `feat/slide-export`, `fix/auth-redirect`, `docs/api-reference`)
2. **Small, focused PRs**: Keep pull requests focused on a single change. Large PRs are harder to review and more likely to introduce issues.
3. **Required reviews**: All PRs must be approved by at least one code owner before merging:
   - [@ruimachado-orbit](https://github.com/ruimachado-orbit) (Rui Machado)
   - [@DiogoAntunesOliveira](https://github.com/DiogoAntunesOliveira) (Diogo Antunes Oliveira)
4. **No direct pushes to `main`**: All changes must go through a PR.
5. **Passing checks**: All CI checks must pass before merging.
6. **Fill out the PR template**: Provide a clear description, motivation, and test plan.

## Commit Messages

Use clear, descriptive commit messages. We recommend the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add PDF export for presentations
fix: resolve slide reordering bug on drag-and-drop
docs: update installation instructions
chore: upgrade electron to v30
```

## Reporting Bugs

Use the [bug report template](https://github.com/ruimachado-orbit/lecta/issues/new?template=bug_report.yml) to report issues. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Electron version, etc.)

## Requesting Features

Use the [feature request template](https://github.com/ruimachado-orbit/lecta/issues/new?template=feature_request.yml) to propose new features. Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Security

If you discover a security vulnerability, **do not open a public issue**. Please see our [Security Policy](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
