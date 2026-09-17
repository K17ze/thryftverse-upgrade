require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "ThryftVideoExport"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://thryftverse.app"
  s.license      = package["license"] || "UNLICENSED"
  s.authors      = "ThryftVerse"

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://thryftverse.app/thryft-video-export.git", :tag => "#{s.version}" }

  s.source_files = [
    # Implementation (Swift)
    "ios/**/*.{swift}",
    # Autolinking/Registration (Objective-C++)
    "ios/**/*.{m,mm}",
    # Implementation (C++ objects)
    "cpp/**/*.{hpp,cpp}",
  ]

  load 'nitrogen/generated/ios/ThryftVideoExport+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
