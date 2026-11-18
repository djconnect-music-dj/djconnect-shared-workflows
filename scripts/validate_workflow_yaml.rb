#!/usr/bin/env ruby
# Fail on duplicate YAML mapping keys; generic parsers often silently overwrite.
require 'psych'

def validate(node, path)
  if node.is_a?(Psych::Nodes::Mapping)
    keys = {}
    node.children.each_slice(2) do |key, value|
      raise "#{path}: complex mapping key" unless key.is_a?(Psych::Nodes::Scalar)
      raise "#{path}: duplicate key #{key.value}" if keys.key?(key.value)
      keys[key.value] = true
      validate(value, "#{path}/#{key.value}")
    end
  elsif node.respond_to?(:children) && node.children
    node.children.each { |child| validate(child, path) }
  end
end
files = ARGV.empty? ? Dir['.github/workflows/*.{yml,yaml}'].sort : ARGV
raise 'No workflow files supplied' if files.empty?
files.each do |file|
  doc = Psych.parse_file(file)
  raise "#{file}: empty document" unless doc
  validate(doc, file)
end
puts 'Workflow YAML duplicate-key validation passed'
