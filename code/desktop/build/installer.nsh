!macro customInstall
  ; Check core VC++ runtime DLLs in System32.
  IfFileExists "$SYSDIR\MSVCP140.dll" check_vcruntime_140 install_vcredist
  check_vcruntime_140:
  IfFileExists "$SYSDIR\VCRUNTIME140.dll" check_vcruntime_140_1 install_vcredist
  check_vcruntime_140_1:
  IfFileExists "$SYSDIR\VCRUNTIME140_1.dll" vcredist_ok install_vcredist

  install_vcredist:
    IfFileExists "$INSTDIR\resources\redist\vc_redist.x64.exe" run_vcredist skip_vcredist
  run_vcredist:
    DetailPrint "Configuring Visual C++ runtime..."
    ExecWait '"$INSTDIR\resources\redist\vc_redist.x64.exe" /quiet /norestart' $1
    DetailPrint "VC++ Redist install result: $1"
    Goto vcredist_done

  vcredist_ok:
    DetailPrint "VC++ runtime already present in System32, skip vc_redist."
    Goto vcredist_done

  skip_vcredist:
    DetailPrint "vc_redist.x64.exe missing in resources/redist, skip install."

  vcredist_done:
!macroend
