; Preserve the established installation and user data when PureTube becomes Viddy.
Var ViddyMigrating
!macro NSIS_HOOK_PREINSTALL
  StrCpy $ViddyMigrating 0
  ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PureTube" "InstallLocation"
  StrCpy $R9 $R8 1
  ${If} $R9 == '$\"'
    StrCpy $R8 $R8 -1 1
  ${EndIf}
  ${If} $R8 != ""
  ${AndIf} ${FileExists} "$R8\puretube.exe"
    StrCpy $INSTDIR $R8
    SetOutPath $INSTDIR
    StrCpy $ViddyMigrating 1
  ${EndIf}
!macroend
!macro NSIS_HOOK_POSTINSTALL
  ${If} $ViddyMigrating == 1
    Delete "$SMPROGRAMS\PureTube.lnk"
    Delete "$DESKTOP\PureTube.lnk"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PureTube"
    ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PureTube"
    ${If} $R8 != ""
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Viddy" $R8
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PureTube"
    ${EndIf}
  ${EndIf}
  ; Updater mode skips creating links for a newly renamed product.
  SetShellVarContext current
  CreateShortcut "$SMPROGRAMS\Viddy.lnk" "$INSTDIR\puretube.exe" "" "$INSTDIR\puretube.exe" 0
!macroend
