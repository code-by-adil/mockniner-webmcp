#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
output_dir="$project_dir/public/audio"
mkdir -p "$output_dir"
audio_work_dir="$(mktemp -d)"
trap 'rm -rf -- "$audio_work_dir"' EXIT

for part in 1 2 3 4; do
  part_work_dir="$audio_work_dir/part-$part"
  mkdir -p "$part_work_dir"
  concat_file="$part_work_dir/concat.txt"
  line_number=0
  while IFS='|' read -r voice words; do
    [[ -z "$words" ]] && continue
    line_number=$((line_number + 1))
    clip="$part_work_dir/$(printf '%03d' "$line_number").aiff"
    /usr/bin/say -v "$voice" -r 145 -o "$clip" "$words"
    printf "file '%s'\n" "$clip" >> "$concat_file"
  done < "$script_dir/audio/part-$part.txt"
  ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$concat_file" -codec:a libmp3lame -b:a 96k "$audio_work_dir/listening-part-$part.mp3"
done

concat_file="$audio_work_dir/listening.txt"
for part in 1 2 3 4; do
  printf "file '%s/listening-part-%s.mp3'\n" "$audio_work_dir" "$part" >> "$concat_file"
done
ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$concat_file" -codec:a libmp3lame -b:a 96k "$output_dir/listening-test-1.mp3"
