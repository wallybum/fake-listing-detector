#!/bin/bash
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer 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" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/wallybum/fake-listing-detector/actions/workflows/main.yml/dispatches \
  -d '{"ref":"master"}'
