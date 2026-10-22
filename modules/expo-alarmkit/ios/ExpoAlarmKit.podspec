Pod::Spec.new do |s|
  s.name           = 'ExpoAlarmKit'
  s.version        = '1.0.0'
  s.summary        = 'AlarmKit (iOS 26+) medication alarms for Pill O-Clock'
  s.description    = 'Schedules system alarms that ring through the silent switch and Focus modes. No-op below iOS 26.'
  s.author         = 'Estudio Taliano'
  s.homepage       = 'https://estudiotaliano.com/pill-o-clock/'
  s.license        = { :type => 'Proprietary' }
  # The app targets iOS 15.1; AlarmKit only exists on iOS 26+, so it is
  # weak-linked and every use is behind `#available(iOS 26.0, *)`.
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # AlarmKit is iOS 26+ and ActivityKit (AlertConfiguration.AlertSound) iOS 16.1+,
  # both newer than the 15.1 deployment target: weak-link them so older iOS
  # versions still launch.
  s.weak_frameworks = 'AlarmKit', 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
