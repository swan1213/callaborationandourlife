# Global hotkeys: they work even while the meeting window has focus. Prints one JSON line per event:
#   {"taken":[...]}       once at start: keys another program already uses
#   {"hotkey":"answer"}   Ctrl+Shift+Space / "view" Ctrl+Shift+M / "hide" Ctrl+Shift+H
#   {"hidden":[...]}      window handles hidden right now, so the server can show them again if it stops this script
# Ctrl+Shift+H hides or shows the browser windows showing the app (title contains one of the marks).
# Started and stopped by server/hotkeys.cjs; exits by itself if the server process is gone.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class Hotkeys {
  [StructLayout(LayoutKind.Sequential)]
  struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  delegate bool EnumProc(IntPtr h, IntPtr l);

  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
  [DllImport("user32.dll")] static extern UIntPtr SetTimer(IntPtr hWnd, UIntPtr id, uint ms, IntPtr fn);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc fn, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);

  const uint WM_HOTKEY = 0x0312, WM_TIMER = 0x0113;
  const uint MOD_CONTROL = 0x2, MOD_SHIFT = 0x4, MOD_NOREPEAT = 0x4000;
  const int SW_HIDE = 0, SW_SHOWNOACTIVATE = 4;

  static readonly string[] Names = { "answer", "view", "hide" };
  static readonly string[] Keys = { "Ctrl+Shift+Space", "Ctrl+Shift+M", "Ctrl+Shift+H" };
  static readonly uint[] Vks = { 0x20, 0x4D, 0x48 }; // Space, M, H
  static readonly HashSet<string> Browsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
    "chrome", "msedge", "brave", "opera", "vivaldi", "firefox"
  };
  static readonly List<IntPtr> hidden = new List<IntPtr>();

  static void Send(string json) { Console.Out.WriteLine(json); Console.Out.Flush(); }

  public static void Run(int parentPid, string[] marks) {
    var taken = new List<string>();
    for (int i = 0; i < Names.Length; i++) {
      if (!RegisterHotKey(IntPtr.Zero, i + 1, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, Vks[i])) taken.Add("\"" + Keys[i] + "\"");
    }
    Send("{\"taken\":[" + string.Join(",", taken) + "]}");

    // A timer message every second, to notice when the server has gone away.
    SetTimer(IntPtr.Zero, UIntPtr.Zero, 1000, IntPtr.Zero);
    MSG msg;
    while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
      if (msg.message == WM_TIMER && !Alive(parentPid)) break;
      if (msg.message != WM_HOTKEY) continue;
      int i = msg.wParam.ToInt32() - 1;
      if (i < 0 || i >= Names.Length) continue;
      if (Names[i] == "hide") ToggleHidden(marks);
      Send("{\"hotkey\":\"" + Names[i] + "\"}");
    }

    for (int i = 0; i < Names.Length; i++) UnregisterHotKey(IntPtr.Zero, i + 1);
    if (hidden.Count > 0) ToggleHidden(marks); // never leave the app hidden
  }

  static bool Alive(int pid) {
    try { return !Process.GetProcessById(pid).HasExited; } catch { return false; }
  }

  // A browser window whose title shows the app: the tab title, or the origin in the on-top window.
  static bool ShowsApp(IntPtr h, string[] marks) {
    var title = new StringBuilder(512);
    GetWindowText(h, title, title.Capacity);
    string t = title.ToString();
    bool match = false;
    foreach (var m in marks) if (m.Length > 0 && t.Contains(m)) match = true;
    if (!match) return false;
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    try { return Browsers.Contains(Process.GetProcessById((int)pid).ProcessName); } catch { return false; }
  }

  static void ToggleHidden(string[] marks) {
    if (hidden.Count > 0) {
      foreach (var h in hidden) ShowWindow(h, SW_SHOWNOACTIVATE); // show without taking focus from the meeting
      hidden.Clear();
    } else {
      EnumWindows((h, l) => { if (IsWindowVisible(h) && ShowsApp(h, marks)) hidden.Add(h); return true; }, IntPtr.Zero);
      foreach (var h in hidden) ShowWindow(h, SW_HIDE);
    }
    var ids = new List<string>();
    foreach (var h in hidden) ids.Add(h.ToInt64().ToString());
    Send("{\"hidden\":[" + string.Join(",", ids) + "]}");
  }
}
'@

[Hotkeys]::Run([int]$env:IA_PARENT_PID, $env:IA_WINDOW_MARKS.Split('|'))
