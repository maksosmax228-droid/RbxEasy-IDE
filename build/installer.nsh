!macro customInit
  ; Ищем установленную версию по имени
  StrCpy $1 0
  loop_hklm:
    EnumRegKey $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" $1
    StrCmp $0 "" try_hkcu
    IntOp $1 $1 + 1
    ReadRegStr $2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$0" "DisplayName"
    StrCmp $2 "RbxEasy" found_hklm loop_hklm

  found_hklm:
    ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$0" "UninstallString"
    goto ask_user

  try_hkcu:
  StrCpy $1 0
  loop_hkcu:
    EnumRegKey $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $1
    StrCmp $0 "" done
    IntOp $1 $1 + 1
    ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$0" "DisplayName"
    StrCmp $2 "RbxEasy" found_hkcu loop_hkcu

  found_hkcu:
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$0" "UninstallString"
    goto ask_user

  ask_user:
    ${if} $0 != ""
      ; Если нажали "Да", просто продолжаем (oneClick сам все обновит)
      ; Если "Нет", предлагаем удалить
      MessageBox MB_YESNO|MB_ICONQUESTION "RbxEasy уже установлен. Обновить программу (старая версия будет заменена)?" IDYES done
      
      MessageBox MB_YESNO|MB_ICONQUESTION "Удалить текущую версию RbxEasy?" IDNO cancel
        StrCpy $3 $0 1
        StrCmp $3 '"' 0 +3
          StrCpy $0 $0 "" 1
          StrCpy $0 $0 -1
        ExecWait '$0'
        Quit
      cancel:
        Quit
    ${endif}

  done:
!macroend
