#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

workflow_paths = Dir[File.expand_path("../workflows/*.{yml,yaml}", __dir__)].sort
lint_steps = workflow_paths.flat_map do |path|
  workflow = YAML.safe_load(File.read(path), aliases: true)
  jobs = workflow.fetch("jobs", {})

  jobs.flat_map do |job_name, job|
    Array(job.fetch("steps", [])).each_with_object([]) do |step, matches|
      action = step["uses"]
      next unless action&.start_with?("golangci/golangci-lint-action@")

      matches << [path, job_name, step]
    end
  end
end

abort "no golangci-lint action step found" if lint_steps.empty?

failures = lint_steps.each_with_object([]) do |(path, job_name, step), matches|
  version = step.fetch("with", {})["version"]
  next if version.is_a?(String) && version.match?(/\Av\d+\.\d+\.\d+\z/)

  relative_path = path.delete_prefix("#{File.expand_path("../..", __dir__)}/")
  matches << "#{relative_path}:#{job_name} must pin golangci-lint to vMAJOR.MINOR.PATCH"
end

abort failures.join("\n") unless failures.empty?

puts "#{lint_steps.length} golangci-lint action pin checked"
