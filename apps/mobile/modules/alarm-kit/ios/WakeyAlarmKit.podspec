Pod::Spec.new do |s|
  s.name           = 'WakeyAlarmKit'
  s.version        = '0.1.0'
  s.summary        = 'AlarmKit bridge for Wakey Wakey'
  s.description    = 'Schedules AlarmKit alarms and tracks challenge sessions.'
  s.author         = ''
  s.homepage       = 'https://github.com/ayushtvora/wakey-wakey'
  s.platforms      = { :ios => '26.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
