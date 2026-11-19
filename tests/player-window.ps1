param([Parameter(Mandatory)][int]$TargetProcessId,[switch]$Move,[int]$Left,[int]$Top)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ViddyWindowCheck {
 public delegate bool WindowCallback(IntPtr h, IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr data);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect rect);
 public static IntPtr Find(uint target) { IntPtr found=IntPtr.Zero;EnumWindows((h,d)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==target){var text=new StringBuilder(256);GetWindowText(h,text,256);if(text.ToString()=="Viddy mini player"){found=h;return false;}}return true;},IntPtr.Zero);return found; }
}
'@
$handle=[ViddyWindowCheck]::Find($TargetProcessId)
if($handle -eq [IntPtr]::Zero){throw 'The isolated test player window was not found.'}
if($Move){if(![ViddyWindowCheck]::SetWindowPos($handle,[IntPtr]::Zero,$Left,$Top,0,0,0x15)){throw 'Could not move the isolated test window.'};Start-Sleep -Milliseconds 350}
$rect=New-Object ViddyWindowCheck+Rect
[void][ViddyWindowCheck]::GetWindowRect($handle,[ref]$rect)
[pscustomobject]@{x=$rect.Left;y=$rect.Top;width=$rect.Right-$rect.Left;height=$rect.Bottom-$rect.Top;topmost=([ViddyWindowCheck]::GetWindowLong($handle,-20) -band 8) -ne 0;resizable=([ViddyWindowCheck]::GetWindowLong($handle,-16) -band 0x40000) -ne 0}|ConvertTo-Json -Compress
