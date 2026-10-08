#!/usr/bin/env node
// The notes of a release: its section of CHANGELOG.md, for the GitHub release a
// tag makes (.github/workflows/release.yml). A tag whose version is not
// package.json's, or has no dated section in the changelog, releases nothing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The body of `## [version] — date`, without its heading; throws when there is none or it is undated. */
export function releaseNotes(changelog, version) {
  const lines = changelog.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`))
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`)
  if (!/^## \[[^\]]+\] — \d{4}-\d{2}-\d{2}$/.test(lines[start] ?? ''))
    throw new Error(`CHANGELOG.md's section for ${version} has no release date: ${lines[start] ?? ''}`)
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return `${lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim()}\n`
}

/** Throws unless the tag names package.json's version. */
export function checkVersion(tag, packageVersion) {
  if (tag !== `v${packageVersion}`) throw new Error(`The tag ${tag} is not package.json's version ${packageVersion}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2] ?? ''
  try {
    checkVersion(tag, JSON.parse(readFileSync('package.json', 'utf8')).version)
    process.stdout.write(releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), tag.slice(1)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
