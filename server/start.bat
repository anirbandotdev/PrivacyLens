@echo off
setlocal EnableDelayedExpansion

goto :start


:: ============================================================
:: Get key press
::
:: %1 = function to call on UpArrow
:: %2 = function to call on DownArrow
:: ============================================================

:get_key
set "get_key_up_action=%1"
set "get_key_down_action=%2"

:get_key_poll
set "get_key_current_key="

for /f "delims=" %%k in (
    'powershell -NoProfile -Command "[Console]::ReadKey($true).Key" 2^>nul'
) do (
    set "get_key_current_key=%%k"
)

if not defined get_key_current_key goto :get_key_poll

if "!get_key_current_key!"=="Enter" (
    goto :eof
)

if "!get_key_current_key!"=="UpArrow" (
    call :%get_key_up_action%
    goto :get_key_poll
)

if "!get_key_current_key!"=="DownArrow" (
    call :%get_key_down_action%
    goto :get_key_poll
)

goto :get_key_poll


:: ============================================================
:: Select Menu
::
:: %1 = Menu title
:: %2 = Variable to receive selected option
:: %3 = Options separated by ;
:: %4 = Allow Back option (0 or 1)
:: ============================================================

:select_menu
set "select_menu_title=%~1"
set "select_menu_selected=0"
set "select_menu_options_string=%~3"
set "select_menu_allow_go_back=%4"

:: Clear old options
for /f "delims==" %%v in ('set select_menu_options[ 2^>nul') do (
    set "%%v="
)

set "select_menu_options_count=0"


:: ------------------------------------------------------------
:: Split options
:: ------------------------------------------------------------

:select_menu_process_options

for /F "tokens=1,* delims=;" %%i in ("!select_menu_options_string!") do (

    set "select_menu_options[!select_menu_options_count!]=%%i"

    set /a select_menu_options_count+=1

    if not "%%j"=="" (
        set "select_menu_options_string=%%j"
        goto :select_menu_process_options
    )
)


:: ------------------------------------------------------------
:: Start menu
:: ------------------------------------------------------------

goto :select_menu_start


:: ============================================================
:: Print menu
:: ============================================================

:select_menu_print

cls

echo(!select_menu_title! !ESC![90m(Use Up/Down arrow keys, Enter to confirm)!ESC![0m
echo(

for /L %%i in (0,1,!select_menu_options_count!-1) do (

    if %%i equ !select_menu_selected! (

        echo(!ESC![92m^> !select_menu_options[%%i]!!ESC![0m

    ) else (

        echo(  !select_menu_options[%%i]!

    )
)


:: Back option

if !select_menu_allow_go_back! equ 1 (

    echo(

    if !select_menu_selected! equ !select_menu_options_count! (

        echo(!ESC![92m^< [Back]!ESC![0m

    ) else (

        echo(  [Back]

    )
)

goto :eof


:: ============================================================
:: Move selection up
:: ============================================================

:select_menu_move_up

set /a select_menu_selected-=1

if !select_menu_selected! lss 0 (
    set "select_menu_selected=!select_menu_options_count!"
)

call :select_menu_print

goto :eof


:: ============================================================
:: Move selection down
:: ============================================================

:select_menu_move_down

set /a select_menu_selected+=1

if !select_menu_selected! gtr !select_menu_options_count! (
    set "select_menu_selected=0"
)

call :select_menu_print

goto :eof


:: ============================================================
:: Start selection
:: ============================================================

:select_menu_start

call :select_menu_print

call :get_key select_menu_move_up select_menu_move_down


:: ------------------------------------------------------------
:: Back selected
:: ------------------------------------------------------------

if !select_menu_allow_go_back! equ 1 (

    if !select_menu_selected! equ !select_menu_options_count! (

        set "%2=-1"

        goto :eof
    )
)


:: ------------------------------------------------------------
:: Return selected option text
:: ------------------------------------------------------------

for %%i in (!select_menu_selected!) do (
    set "%2=!select_menu_options[%%i]!"
)

goto :eof


:: ============================================================
:: MAIN
:: ============================================================

:start

:: Get ANSI escape character
set "ESC="

for /f %%A in ('echo prompt $E ^| cmd') do (
    set "ESC=%%A"
)

title Select Test


:: ------------------------------------------------------------
:: Show model selection
:: ------------------------------------------------------------

set "selected="

call :select_menu "Choose a model:" selected "qwen;gemini" 1


:: ------------------------------------------------------------
:: Exit if Back was selected
:: ------------------------------------------------------------

if "%selected%"=="-1" (
    endlocal
    exit /b
)


:: ------------------------------------------------------------
:: Set MODEL
:: ------------------------------------------------------------

set "MODEL=%selected%"


:: ------------------------------------------------------------
:: Start Node.js
:: ------------------------------------------------------------

cls

echo Selected model: %MODEL%
echo(

node src/index.js


:: ------------------------------------------------------------
:: End
:: ------------------------------------------------------------

endlocal
