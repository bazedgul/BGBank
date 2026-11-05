Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class WindowsCredentialStore {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)] public static extern void CredFree(IntPtr credential);
  public static string ReadPassword(string target) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) throw new InvalidOperationException("Credential not found in Windows Credential Manager.");
    try {
      var credential = (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
      if (credential.CredentialBlob == IntPtr.Zero || credential.CredentialBlobSize <= 0) throw new InvalidOperationException("Credential has no password.");
      return Marshal.PtrToStringUni(credential.CredentialBlob, credential.CredentialBlobSize / 2);
    } finally { CredFree(pointer); }
  }
}
'@

$credentialTarget = 'BGBank/bg_bank_app'
$password = [WindowsCredentialStore]::ReadPassword($credentialTarget)
if ([string]::IsNullOrWhiteSpace($password)) { throw 'Credential password is empty.' }

$databaseUrl = 'postgresql://bg_bank_app@localhost:54330/bg_bank_dev'
$uri = [UriBuilder]$databaseUrl
$uri.UserName = 'bg_bank_app'
$uri.Password = $password
$env:DATABASE_URL = $uri.Uri.AbsoluteUri

if ($env:DATABASE_URL -match 'bg_bank$' -or $env:DATABASE_URL -notmatch 'bg_bank_app') { throw 'Refusing to launch with a privileged database identity.' }

& pnpm.cmd start:dev
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
