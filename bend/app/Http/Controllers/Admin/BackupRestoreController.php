<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\SystemLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * BackupRestoreController
 * 
 * Handles database backup and restore operations with AES encryption.
 */
class BackupRestoreController extends Controller
{
    protected $backupPath;

    public function __construct()
    {
        $this->backupPath = storage_path('app/private/backups');
        
        // Ensure backup directory exists
        if (!File::exists($this->backupPath)) {
            File::makeDirectory($this->backupPath, 0755, true);
        }
    }

    /**
     * List all backup files with metadata
     */
    public function index()
    {
        $backups = [];
        $files = File::files($this->backupPath);

        foreach ($files as $file) {
            if (pathinfo($file, PATHINFO_EXTENSION) === 'encrypted') {
                $filename = $file->getFilename();
                $filepath = $file->getPathname();
                
                // Extract timestamp from filename (backup_YYYYMMDD_HHMMSS.sql.encrypted)
                if (preg_match('/backup_(\d{8})_(\d{6})/', $filename, $matches)) {
                    $dateStr = $matches[1];
                    $timeStr = $matches[2];
                    $timestamp = \Carbon\Carbon::createFromFormat('Ymd His', $dateStr . ' ' . $timeStr);
                } else {
                    $timestamp = \Carbon\Carbon::createFromTimestamp(File::lastModified($filepath));
                }

                $backups[] = [
                    'filename' => $filename,
                    'size' => File::size($filepath),
                    'size_formatted' => $this->formatBytes(File::size($filepath)),
                    'created_at' => $timestamp->toDateTimeString(),
                    'created_at_formatted' => $timestamp->format('Y-m-d H:i:s'),
                    'age' => $timestamp->diffForHumans(),
                ];
            }
        }

        // Sort by creation date (newest first)
        usort($backups, function ($a, $b) {
            return strtotime($b['created_at']) - strtotime($a['created_at']);
        });

        return response()->json(['backups' => $backups]);
    }

    /**
     * Create a new encrypted backup
     */
    public function create()
    {
        try {
            // Check if current database connection is MySQL
            $connection = DB::connection();
            $driver = $connection->getDriverName();
            
            if ($driver !== 'mysql') {
                return response()->json([
                    'message' => 'Backup is only supported for MySQL databases. Current database driver: ' . $driver,
                ], 500);
            }

            // Check if mysqldump is available
            $mysqldumpPath = $this->findMysqldumpPath();
            if (!$mysqldumpPath) {
                return response()->json([
                    'message' => 'mysqldump command not found. Please ensure MySQL client tools are installed.',
                ], 500);
            }

            // Get database connection info
            $config = config('database.connections.mysql');
            $database = $config['database'];
            $username = $config['username'];
            $password = $config['password'];
            $host = $config['host'];
            $port = $config['port'] ?? 3306;

            // Generate backup filename with timestamp
            $timestamp = now()->format('Ymd_His');
            $filename = "backup_{$timestamp}.sql";
            $encryptedFilename = "backup_{$timestamp}.sql.encrypted";
            $tempPath = storage_path('app/temp/' . $filename);
            $encryptedPath = $this->backupPath . '/' . $encryptedFilename;

            // Ensure temp directory exists
            $tempDir = storage_path('app/temp');
            if (!File::exists($tempDir)) {
                File::makeDirectory($tempDir, 0755, true);
            }

            // Build mysqldump command with proper escaping
            $errorFile = storage_path('app/temp/mysqldump_error_' . time() . '.txt');
            $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
            
            // Create a temporary MySQL configuration file for secure password handling
            $cnfPath = storage_path('app/temp/my_' . time() . '.cnf');
            $cnfContent = "[client]\n";
            $cnfContent .= "host=" . $host . "\n";
            $cnfContent .= "port=" . $port . "\n";
            $cnfContent .= "user=" . $username . "\n";
            $cnfContent .= "password=" . $password . "\n";
            File::put($cnfPath, $cnfContent);
            
            try {
                if ($isWindows) {
                    // Windows: Use proper path handling without double escaping
                    $tempPathWin = str_replace('/', '\\', $tempPath);
                    $errorFileWin = str_replace('/', '\\', $errorFile);
                    $cnfPathWin = str_replace('/', '\\', $cnfPath);
                    $mysqldumpPathWin = str_replace('/', '\\', $mysqldumpPath);
                    
                    // Add --add-drop-table to ensure tables are dropped during restore
                    // Add --add-drop-database if needed, or use --add-drop-table
                    // --add-drop-table ensures DROP TABLE IF EXISTS before CREATE TABLE
                    $command = sprintf(
                        '%s --defaults-file=%s --single-transaction --routines --triggers --add-drop-table %s > %s 2> %s',
                        escapeshellarg($mysqldumpPathWin),
                        escapeshellarg($cnfPathWin),
                        escapeshellarg($database),
                        escapeshellarg($tempPathWin),
                        escapeshellarg($errorFileWin)
                    );
                } else {
                    // Unix/Linux: Use defaults-file with --add-drop-table
                    $command = sprintf(
                        '%s --defaults-file=%s --single-transaction --routines --triggers --add-drop-table %s > %s 2> %s',
                        escapeshellarg($mysqldumpPath),
                        escapeshellarg($cnfPath),
                        escapeshellarg($database),
                        escapeshellarg($tempPath),
                        escapeshellarg($errorFile)
                    );
                }

                // Execute mysqldump
                // On Windows, we need to handle cmd.exe syntax properly
                if ($isWindows) {
                    // Create a temporary batch file to handle complex command with spaces in paths
                    $batchFile = storage_path('app/temp/mysqldump_' . time() . '.bat');
                    $batchContent = '@echo off' . "\n";
                    $batchContent .= 'cd /d "' . dirname($tempPathWin) . '"' . "\n";
                    $batchContent .= $command . ' 2>&1' . "\n";
                    File::put($batchFile, $batchContent);
                    
                    // Execute the batch file
                    exec('"' . $batchFile . '"', $output, $returnCode);
                    
                    // Clean up batch file
                    if (File::exists($batchFile)) {
                        File::delete($batchFile);
                    }
                    
                    $stderr = implode("\n", $output);
                    $stdout = '';
                } else {
                    // On Unix/Linux, use exec with proper error capture
                    exec($command . ' 2>&1', $output, $returnCode);
                    $stderr = implode("\n", $output);
                    $stdout = '';
                }
                
                // Read error file if it exists
                $errorMessage = '';
                if (File::exists($errorFile)) {
                    $errorMessage = File::get($errorFile);
                    File::delete($errorFile);
                }

                // Read temp file to check if it contains an error message instead of SQL
                $tempFileContent = '';
                if (File::exists($tempPath)) {
                    $tempFileContent = File::get($tempPath);
                    // Check if it looks like an error message (starts with common error patterns)
                    if (strlen($tempFileContent) < 1000 && (
                        strpos($tempFileContent, 'mysqldump:') !== false ||
                        strpos($tempFileContent, 'Error') !== false ||
                        strpos($tempFileContent, 'error') !== false ||
                        strpos($tempFileContent, 'Access denied') !== false ||
                        strpos($tempFileContent, 'Unknown database') !== false ||
                        !preg_match('/^--|^\/\*|^CREATE|^INSERT|^DROP/i', $tempFileContent)
                    )) {
                        // This looks like an error message, not SQL
                        $tempFileContent = trim($tempFileContent);
                    } else {
                        $tempFileContent = ''; // It's valid SQL, don't include in error
                    }
                }

                // Combine all error sources
                $errorOutput = trim($stderr . "\n" . $errorMessage . "\n" . $tempFileContent);

                if ($returnCode !== 0 || !File::exists($tempPath) || File::size($tempPath) === 0 || strlen($tempFileContent) > 0) {
                    $fullError = $errorOutput ?: 'Command exited with code ' . $returnCode;
                    
                    // If temp file contains an error, that's the actual error
                    if (strlen($tempFileContent) > 0) {
                        $fullError = $tempFileContent;
                    }
                    
                    // Log the error for debugging
                    $actualTempContent = File::exists($tempPath) ? File::get($tempPath) : '';
                    $logData = [
                        'command' => str_replace($password, '***', $command),
                        'return_code' => $returnCode,
                        'error_output' => $fullError,
                        'stderr' => $stderr,
                        'stdout' => $stdout,
                        'error_file_content' => $errorMessage,
                        'temp_path' => $tempPath,
                        'temp_exists' => File::exists($tempPath),
                        'temp_size' => File::exists($tempPath) ? File::size($tempPath) : 0,
                        'temp_file_content' => substr($actualTempContent, 0, 500), // First 500 chars of temp file
                        'config_file_exists' => File::exists($cnfPath),
                        'config_file_content' => File::exists($cnfPath) ? str_replace($password, '***', File::get($cnfPath)) : null,
                    ];
                    
                    if ($isWindows) {
                        $logData['command_executed'] = 'Batch file execution';
                        $logData['is_windows'] = true;
                    } else {
                        $logData['command_executed'] = str_replace($password, '***', $command) . ' 2>&1';
                    }
                    
                    \Illuminate\Support\Facades\Log::error('Backup creation failed', $logData);

                    // Clean up config file
                    if (File::exists($cnfPath)) {
                        File::delete($cnfPath);
                    }

                    return response()->json([
                        'message' => 'Failed to create database backup: ' . $fullError,
                    ], 500);
                }

                // Read the SQL dump
                $sqlContent = File::get($tempPath);

                // Encrypt the SQL content
                $encryptedContent = Crypt::encrypt($sqlContent);

                // Save encrypted backup
                File::put($encryptedPath, $encryptedContent);

                // Clean up temp files
                File::delete($tempPath);
                if (File::exists($cnfPath)) {
                    File::delete($cnfPath);
                }
            } finally {
                // Ensure config file is always cleaned up
                if (File::exists($cnfPath)) {
                    File::delete($cnfPath);
                }
            }

            // Get table counts for metadata
            $tableCounts = $this->getTableCounts();

            // Log the backup creation
            SystemLogService::logSystem('backup_created', 'Database backup created: ' . $encryptedFilename, [
                'filename' => $encryptedFilename,
                'size' => File::size($encryptedPath),
                'table_counts' => $tableCounts,
            ]);

            return response()->json([
                'message' => 'Backup created successfully',
                'filename' => $encryptedFilename,
                'size' => File::size($encryptedPath),
                'size_formatted' => $this->formatBytes(File::size($encryptedPath)),
                'created_at' => now()->toDateTimeString(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to create backup: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Download a backup file
     */
    public function download($filename)
    {
        // Sanitize filename
        $filename = basename($filename);
        $filepath = $this->backupPath . '/' . $filename;

        if (!File::exists($filepath) || pathinfo($filename, PATHINFO_EXTENSION) !== 'encrypted') {
            return response()->json(['message' => 'Backup file not found'], 404);
        }

        return response()->download($filepath, $filename);
    }

    /**
     * Delete a backup file
     */
    public function delete($filename)
    {
        // Sanitize filename
        $filename = basename($filename);
        $filepath = $this->backupPath . '/' . $filename;

        if (!File::exists($filepath) || pathinfo($filename, PATHINFO_EXTENSION) !== 'encrypted') {
            return response()->json(['message' => 'Backup file not found'], 404);
        }

        File::delete($filepath);

        // Log the deletion
        SystemLogService::logSystem('backup_deleted', 'Database backup deleted: ' . $filename, [
            'filename' => $filename,
        ]);

        return response()->json(['message' => 'Backup deleted successfully']);
    }

    /**
     * Upload a backup file (for restore or integrity check)
     */
    public function upload(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|max:102400', // 100MB max, accept any file type
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Invalid file. Please upload a backup file (max 100MB)',
                'errors' => $validator->errors(),
            ], 422);
        }

        $file = $request->file('file');
        
        // Validate file extension
        $extension = $file->getClientOriginalExtension();
        if ($extension !== 'encrypted') {
            return response()->json([
                'message' => 'Invalid file type. Please upload an encrypted backup file (.encrypted)',
            ], 422);
        }

        $tempPath = $file->storeAs('temp/backups', $file->getClientOriginalName(), 'local');

        return response()->json([
            'message' => 'File uploaded successfully',
            'temp_path' => $tempPath,
            'filename' => $file->getClientOriginalName(),
        ]);
    }

    /**
     * Check data integrity of a backup
     */
    public function checkIntegrity(Request $request)
    {
        try {
            $backupContent = $this->getBackupContent($request);

            if (!$backupContent) {
                \Illuminate\Support\Facades\Log::warning('Integrity check failed: backup content not found', [
                    'filename' => $request->input('filename'),
                    'has_upload' => $request->hasFile('file'),
                ]);
                return response()->json([
                    'message' => 'Backup file not found or invalid',
                ], 404);
            }

            // Decrypt the backup
            try {
                $sqlContent = Crypt::decrypt($backupContent);
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error('Integrity check decryption failed', [
                    'error' => $e->getMessage(),
                ]);
                return response()->json([
                    'message' => 'Failed to decrypt backup file. It may be corrupted or encrypted with a different key.',
                ], 400);
            }

            // Parse SQL dump to extract table information
            $backupData = $this->parseSqlDump($sqlContent);
            
            // Log parsing results for debugging
            \Illuminate\Support\Facades\Log::info('Backup parsing results', [
                'total_tables' => count($backupData['tables']),
                'total_records' => $backupData['total_records'],
                'visit_notes_count' => $backupData['tables']['visit_notes']['records'] ?? 0,
                'patient_medical_histories_count' => $backupData['tables']['patient_medical_histories']['records'] ?? 0,
                'patient_visits_count' => $backupData['tables']['patient_visits']['records'] ?? 0,
            ]);

            // Get current database state
            $currentData = $this->getCurrentDatabaseState();
            
            // Log current state for debugging
            \Illuminate\Support\Facades\Log::info('Current database state', [
                'total_tables' => count($currentData['tables']),
                'total_records' => $currentData['total_records'],
                'visit_notes_count' => $currentData['tables']['visit_notes']['records'] ?? 0,
                'patient_medical_histories_count' => $currentData['tables']['patient_medical_histories']['records'] ?? 0,
                'patient_visits_count' => $currentData['tables']['patient_visits']['records'] ?? 0,
            ]);

            // Compare
            $comparison = $this->compareDatabaseStates($backupData, $currentData);

            // Extract backup timestamp from SQL if available, or from filename
            $backupTimestamp = $backupData['timestamp'] ?? null;
            if (!$backupTimestamp && $request->filled('filename')) {
                $filename = $request->input('filename');
                if (preg_match('/backup_(\d{8})_(\d{6})/', $filename, $matches)) {
                    $dateStr = $matches[1];
                    $timeStr = $matches[2];
                    $backupTimestamp = \Carbon\Carbon::createFromFormat('Ymd His', $dateStr . ' ' . $timeStr);
                }
            }

            $result = [
                'backup_timestamp' => $backupTimestamp ? $backupTimestamp->toDateTimeString() : null,
                'backup_age' => $backupTimestamp ? $backupTimestamp->diffForHumans() : 'Unknown',
                'backup_tables' => $backupData['tables'],
                'current_tables' => $currentData['tables'],
                'missing_tables' => $comparison['missing_tables'],
                'extra_tables' => $comparison['extra_tables'],
                'table_differences' => $comparison['differences'],
                'total_backup_records' => $backupData['total_records'],
                'total_current_records' => $currentData['total_records'],
                'summary' => $comparison['summary'],
            ];

            return response()->json($result);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Integrity check failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'message' => 'Failed to check integrity: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Restore database from backup
     */
    public function restore(Request $request)
    {
        try {
            $backupContent = $this->getBackupContent($request);

            if (!$backupContent) {
                return response()->json([
                    'message' => 'Backup file not found or invalid',
                ], 404);
            }

            // Decrypt the backup
            try {
                $sqlContent = Crypt::decrypt($backupContent);
            } catch (\Exception $e) {
                return response()->json([
                    'message' => 'Failed to decrypt backup file. It may be corrupted or encrypted with a different key.',
                ], 400);
            }

            // Get database connection
            $config = config('database.connections.mysql');
            $database = $config['database'];

            // Write SQL to temp file
            $tempSqlPath = storage_path('app/temp/restore_' . time() . '.sql');
            File::put($tempSqlPath, $sqlContent);

            // Build mysql command
            $mysqlPath = $this->findMysqlPath();
            if (!$mysqlPath) {
                File::delete($tempSqlPath);
                return response()->json([
                    'message' => 'mysql command not found. Please ensure MySQL client tools are installed.',
                ], 500);
            }

            $username = $config['username'];
            $password = $config['password'];
            $host = $config['host'];
            $port = $config['port'] ?? 3306;

            // Get all existing table names and drop them first to ensure a clean restore
            // This prevents any foreign key constraint issues or leftover data
            $tables = DB::select("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [$database]);
            $dropTablesSql = "-- Disable foreign key checks\n";
            $dropTablesSql .= "SET FOREIGN_KEY_CHECKS=0;\n";
            
            if (!empty($tables)) {
                $dropTablesSql .= "-- Drop all existing tables\n";
                foreach ($tables as $table) {
                    $dropTablesSql .= "DROP TABLE IF EXISTS `" . $table->TABLE_NAME . "`;\n";
                }
                $dropTablesSql .= "\n";
            }
            
            // Prepare restore SQL: disable foreign keys, drop all tables, then restore
            // This ensures a clean restore
            $restoreSql = $dropTablesSql;
            $restoreSql .= "SET SESSION sql_mode='NO_AUTO_VALUE_ON_ZERO';\n";
            $restoreSql .= "\n";
            $restoreSql .= $sqlContent;
            $restoreSql .= "\n";
            $restoreSql .= "-- Re-enable foreign key checks\n";
            $restoreSql .= "SET FOREIGN_KEY_CHECKS=1;\n";
            File::put($tempSqlPath, $restoreSql);

            // Create config file for secure password handling
            $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
            $cnfPath = storage_path('app/temp/restore_my_' . time() . '.cnf');
            $cnfContent = "[client]\n";
            $cnfContent .= "host=" . $host . "\n";
            $cnfContent .= "port=" . $port . "\n";
            $cnfContent .= "user=" . $username . "\n";
            $cnfContent .= "password=" . $password . "\n";
            File::put($cnfPath, $cnfContent);

            try {
                if ($isWindows) {
                    $tempSqlPathWin = str_replace('/', '\\', $tempSqlPath);
                    $cnfPathWin = str_replace('/', '\\', $cnfPath);
                    $mysqlPathWin = str_replace('/', '\\', $mysqlPath);

                    // Build batch file to handle redirection safely
                    $batchFile = storage_path('app/temp/mysql_restore_' . time() . '.bat');
                    $batchContent = '@echo off' . "\r\n";
                    $batchContent .= 'cd /d "' . dirname($tempSqlPathWin) . '"' . "\r\n";
                    $batchContent .= '"' . $mysqlPathWin . '" --defaults-file="' . $cnfPathWin . '" "' . $database . '" < "' . $tempSqlPathWin . '"' . "\r\n";
                    File::put($batchFile, $batchContent);

                    $command = '"' . $batchFile . '"';
                    $commandToExecute = $command;
                } else {
                    $command = sprintf(
                        '%s --defaults-file=%s %s < %s 2>&1',
                        escapeshellarg($mysqlPath),
                        escapeshellarg($cnfPath),
                        escapeshellarg($database),
                        escapeshellarg($tempSqlPath)
                    );
                    $commandToExecute = $command;
                }

                // Execute restore command and capture all output
                if ($isWindows) {
                    // On Windows, redirect stderr to stdout in batch file
                    $batchContent = str_replace(
                        '"' . $mysqlPathWin . '" --defaults-file="' . $cnfPathWin . '" "' . $database . '" < "' . $tempSqlPathWin . '"',
                        '"' . $mysqlPathWin . '" --defaults-file="' . $cnfPathWin . '" "' . $database . '" < "' . $tempSqlPathWin . '" 2>&1',
                        $batchContent
                    );
                    File::put($batchFile, $batchContent);
                    $command = '"' . $batchFile . '"';
                    $commandToExecute = $command;
                }
                
                exec($commandToExecute . ' 2>&1', $output, $returnCode);
                $errorOutput = implode("\n", $output);

                // Clean up temp files
                if (File::exists($tempSqlPath)) {
                    File::delete($tempSqlPath);
                }
                if ($isWindows && isset($batchFile) && File::exists($batchFile)) {
                    File::delete($batchFile);
                }
                if (File::exists($cnfPath)) {
                    File::delete($cnfPath);
                }

                if ($returnCode !== 0) {
                    \Illuminate\Support\Facades\Log::error('Backup restore failed', [
                        'command' => $isWindows ? 'batch_file_execution' : str_replace($password, '***', $command),
                        'return_code' => $returnCode,
                        'error_output' => $errorOutput,
                        'sql_file_size' => File::exists($tempSqlPath) ? File::size($tempSqlPath) : 0,
                    ]);
                    return response()->json([
                        'message' => 'Failed to restore database: ' . ($errorOutput ?: 'Unknown error occurred. Check logs for details.'),
                    ], 500);
                }
                
                // Log successful restore with details
                \Illuminate\Support\Facades\Log::info('Backup restore completed', [
                    'filename' => $request->input('filename', 'uploaded_file'),
                    'return_code' => $returnCode,
                    'output_length' => strlen($errorOutput),
                    'has_warnings' => stripos($errorOutput, 'warning') !== false || stripos($errorOutput, 'error') !== false,
                ]);
                
                // Check for warnings in output even if return code is 0
                if (!empty($errorOutput) && (stripos($errorOutput, 'error') !== false || stripos($errorOutput, 'duplicate') !== false)) {
                    \Illuminate\Support\Facades\Log::warning('Backup restore completed with warnings', [
                        'output' => substr($errorOutput, 0, 1000), // First 1000 chars
                    ]);
                }
            } finally {
                // Ensure config file is always cleaned up
                if (File::exists($cnfPath)) {
                    File::delete($cnfPath);
                }
            }

            // Log the restore
            $filename = $request->input('filename', 'uploaded_file');
            SystemLogService::logSystem('backup_restored', 'Database restored from backup: ' . $filename, [
                'filename' => $filename,
                'restored_by' => auth()->id(),
            ]);

            return response()->json([
                'message' => 'Database restored successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to restore database: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get backup content from request (either server file or uploaded file)
     */
    protected function getBackupContent(Request $request)
    {
        if ($request->hasFile('file')) {
            // Handle uploaded file
            $file = $request->file('file');
            return file_get_contents($file->getRealPath());
        } elseif ($request->filled('filename')) {
            // Handle server file
            $filename = basename($request->input('filename'));
            $filepath = $this->backupPath . '/' . $filename;
            
            if (File::exists($filepath)) {
                return File::get($filepath);
            }
        }

        return null;
    }

    /**
     * Find mysqldump executable path
     */
    protected function findMysqldumpPath()
    {
        $paths = [
            'mysqldump',
            '/usr/bin/mysqldump',
            '/usr/local/bin/mysqldump',
            'C:\\xampp\\mysql\\bin\\mysqldump.exe',
            'C:\\wamp\\bin\\mysql\\mysql' . $this->getMysqlVersion() . '\\bin\\mysqldump.exe',
        ];

        foreach ($paths as $path) {
            $output = [];
            exec(escapeshellarg($path) . ' --version 2>&1', $output, $returnCode);
            if ($returnCode === 0) {
                return $path;
            }
        }

        return null;
    }

    /**
     * Find mysql executable path
     */
    protected function findMysqlPath()
    {
        $paths = [
            'mysql',
            '/usr/bin/mysql',
            '/usr/local/bin/mysql',
            'C:\\xampp\\mysql\\bin\\mysql.exe',
            'C:\\wamp\\bin\\mysql\\mysql' . $this->getMysqlVersion() . '\\bin\\mysql.exe',
        ];

        foreach ($paths as $path) {
            $output = [];
            exec(escapeshellarg($path) . ' --version 2>&1', $output, $returnCode);
            if ($returnCode === 0) {
                return $path;
            }
        }

        return null;
    }

    /**
     * Get MySQL version (for Windows paths)
     */
    protected function getMysqlVersion()
    {
        // Try to detect MySQL version
        $output = [];
        exec('mysql --version 2>&1', $output, $returnCode);
        if ($returnCode === 0 && isset($output[0])) {
            if (preg_match('/(\d+\.\d+)/', $output[0], $matches)) {
                return str_replace('.', '', $matches[1]);
            }
        }
        return '57'; // Default
    }

    /**
     * Parse SQL dump to extract table information
     */
    protected function parseSqlDump($sqlContent)
    {
        $tables = [];
        $totalRecords = 0;
        $timestamp = null;

        // Extract timestamp from comments if available
        if (preg_match('/-- Dump completed on (\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/', $sqlContent, $matches)) {
            $timestamp = \Carbon\Carbon::createFromFormat('Y-m-d H:i:s', $matches[1]);
        }

        // Extract CREATE TABLE statements first to know which tables exist
        preg_match_all('/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?(\w+)`?)/i', $sqlContent, $createMatches);
        
        if (isset($createMatches[1])) {
            foreach ($createMatches[1] as $table) {
                $tables[$table] = [
                    'exists' => true,
                    'records' => 0,
                ];
            }
        }

        // Parse INSERT statements - need to handle multi-line and multi-value inserts
        // We need to count the number of value tuples (rows), not just INSERT statements
        
        $tableRecordCounts = [];
        
        // Find all INSERT INTO statements by splitting on INSERT INTO
        // This handles multi-line INSERT statements better
        $insertStatements = preg_split('/(?=INSERT\s+INTO\s+)/i', $sqlContent);
        
        $debugTables = ['visit_notes', 'patient_medical_histories', 'patient_visits'];
        $debugCounts = [];
        
        foreach ($insertStatements as $statementIndex => $statement) {
            // Extract table name
            if (!preg_match('/^INSERT\s+INTO\s+`?(\w+)`?/i', $statement, $tableMatch)) {
                continue;
            }
            
            $tableName = $tableMatch[1];
            
            // Find the VALUES clause - handle very large multiline statements
            // First, find the position of VALUES keyword
            if (!preg_match('/VALUES\s+/i', $statement, $valuesPosMatch, PREG_OFFSET_CAPTURE)) {
                // Log if it's a debug table and we couldn't find VALUES
                if (in_array($tableName, $debugTables)) {
                    \Illuminate\Support\Facades\Log::warning('INSERT statement without VALUES clause found', [
                        'table' => $tableName,
                        'statement_length' => strlen($statement),
                        'statement_preview' => substr($statement, 0, 200),
                    ]);
                }
                continue;
            }
            
            // Get the offset where VALUES starts
            $valuesOffset = $valuesPosMatch[0][1] + strlen($valuesPosMatch[0][0]);
            
            // Find the semicolon that ends this INSERT statement (not nested)
            // Look for semicolon that's not inside parentheses or strings
            $depth = 0;
            $inString = false;
            $stringChar = null;
            $semicolonPos = -1;
            $statementLen = strlen($statement);
            
            for ($i = $valuesOffset; $i < $statementLen; $i++) {
                $char = $statement[$i];
                $prevChar = $i > 0 ? $statement[$i - 1] : null;
                
                // Handle string literals
                if (($char === "'" || $char === '"') && $prevChar !== '\\') {
                    if (!$inString) {
                        $inString = true;
                        $stringChar = $char;
                    } elseif ($char === $stringChar) {
                        $inString = false;
                        $stringChar = null;
                    }
                    continue;
                }
                
                if ($inString) {
                    continue; // Skip everything inside strings
                }
                
                // Track parentheses depth
                if ($char === '(') {
                    $depth++;
                } elseif ($char === ')') {
                    $depth--;
                } elseif ($char === ';' && $depth === 0) {
                    // Found the semicolon that ends this INSERT statement
                    $semicolonPos = $i;
                    break;
                }
            }
            
            // Extract the VALUES part (everything from VALUES to semicolon)
            if ($semicolonPos > $valuesOffset) {
                $valuesPart = substr($statement, $valuesOffset, $semicolonPos - $valuesOffset);
            } else {
                // No semicolon found, take everything after VALUES
                $valuesPart = substr($statement, $valuesOffset);
            }
            
            $valuesPart = trim($valuesPart);
            
            if (empty($valuesPart)) {
                continue;
            }
            
            // Count rows by counting value tuples: (values), (values), (values)
            // We need to count opening parentheses at depth 0 (not nested)
            $count = 0;
            $depth = 0;
            $inString = false;
            $stringChar = null;
            $len = strlen($valuesPart);
            
            for ($i = 0; $i < $len; $i++) {
                $char = $valuesPart[$i];
                $prevChar = $i > 0 ? $valuesPart[$i - 1] : null;
                
                // Handle string literals (skip parentheses inside strings)
                if (($char === "'" || $char === '"') && $prevChar !== '\\') {
                    if (!$inString) {
                        $inString = true;
                        $stringChar = $char;
                    } elseif ($char === $stringChar) {
                        $inString = false;
                        $stringChar = null;
                    }
                    continue;
                }
                
                if ($inString) {
                    continue; // Skip everything inside strings
                }
                
                // Count parentheses
                if ($char === '(') {
                    if ($depth === 0) {
                        $count++; // This is the start of a new value tuple (row)
                    }
                    $depth++;
                } elseif ($char === ')') {
                    $depth--;
                }
            }
            
            // If we found at least one row, add to counts
            if ($count > 0) {
                $tableRecordCounts[$tableName] = ($tableRecordCounts[$tableName] ?? 0) + $count;
                
                // Debug logging for specific tables
                if (in_array($tableName, $debugTables)) {
                    if (!isset($debugCounts[$tableName])) {
                        $debugCounts[$tableName] = ['inserts' => 0, 'rows' => 0];
                    }
                    $debugCounts[$tableName]['inserts']++;
                    $debugCounts[$tableName]['rows'] += $count;
                }
            }
        }
        
        // Log debug info for specific tables
        if (!empty($debugCounts)) {
            \Illuminate\Support\Facades\Log::info('Parsed INSERT statements for debug tables', $debugCounts);
        }

        // Update table records with actual counts
        foreach ($tableRecordCounts as $tableName => $count) {
            if (isset($tables[$tableName])) {
                $tables[$tableName]['records'] = $count;
            } else {
                // Table found in INSERT but not in CREATE TABLE (might be from old backup format)
                $tables[$tableName] = [
                    'exists' => true,
                    'records' => $count,
                ];
            }
            $totalRecords += $count;
        }

        return [
            'tables' => $tables,
            'total_records' => $totalRecords,
            'timestamp' => $timestamp,
        ];
    }

    /**
     * Get current database state
     */
    protected function getCurrentDatabaseState()
    {
        $tables = [];
        $totalRecords = 0;

        // Get all tables using information_schema (more reliable than SHOW TABLES)
        $databaseName = DB::connection()->getDatabaseName();
        $tableNames = DB::select("
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_TYPE = 'BASE TABLE'
        ", [$databaseName]);

        foreach ($tableNames as $tableRow) {
            // Access the property - it's returned as TABLE_NAME from information_schema
            $tableName = $tableRow->TABLE_NAME ?? (array_values((array)$tableRow)[0] ?? null);
            
            if (!$tableName) {
                continue;
            }
            
            try {
                // Get row count
                $count = DB::table($tableName)->count();
                
                $tables[$tableName] = [
                    'exists' => true,
                    'records' => $count,
                ];
                
                $totalRecords += $count;
            } catch (\Exception $e) {
                // Skip tables that can't be accessed
                \Illuminate\Support\Facades\Log::warning('Failed to count rows in table: ' . $tableName, [
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return [
            'tables' => $tables,
            'total_records' => $totalRecords,
        ];
    }

    /**
     * Compare two database states
     */
    protected function compareDatabaseStates($backupData, $currentData)
    {
        $backupTables = $backupData['tables'];
        $currentTables = $currentData['tables'];

        $missingTables = [];
        $extraTables = [];
        $differences = [];

        // Find missing tables (in backup but not in current)
        foreach ($backupTables as $tableName => $backupInfo) {
            if (!isset($currentTables[$tableName])) {
                $missingTables[] = [
                    'table' => $tableName,
                    'backup_records' => $backupInfo['records'],
                ];
            } else {
                // Compare record counts
                $currentRecords = $currentTables[$tableName]['records'];
                $backupRecords = $backupInfo['records'];
                
                if ($currentRecords !== $backupRecords) {
                    $differences[] = [
                        'table' => $tableName,
                        'backup_records' => $backupRecords,
                        'current_records' => $currentRecords,
                        'difference' => $currentRecords - $backupRecords,
                    ];
                }
            }
        }

        // Find extra tables (in current but not in backup)
        foreach ($currentTables as $tableName => $currentInfo) {
            if (!isset($backupTables[$tableName])) {
                $extraTables[] = [
                    'table' => $tableName,
                    'current_records' => $currentInfo['records'],
                ];
            }
        }

        // Create summary
        $summary = [
            'backup_tables_count' => count($backupTables),
            'current_tables_count' => count($currentTables),
            'missing_tables_count' => count($missingTables),
            'extra_tables_count' => count($extraTables),
            'tables_with_differences' => count($differences),
            'total_backup_records' => $backupData['total_records'],
            'total_current_records' => $currentData['total_records'],
            'records_difference' => $currentData['total_records'] - $backupData['total_records'],
        ];

        return [
            'missing_tables' => $missingTables,
            'extra_tables' => $extraTables,
            'differences' => $differences,
            'summary' => $summary,
        ];
    }

    /**
     * Get table counts for metadata
     */
    protected function getTableCounts()
    {
        $counts = [];
        $databaseName = DB::connection()->getDatabaseName();
        
        // Use information_schema for more reliable table listing
        $tableNames = DB::select("
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_TYPE = 'BASE TABLE'
        ", [$databaseName]);

        foreach ($tableNames as $tableRow) {
            // Access the property - it's returned as TABLE_NAME from information_schema
            $tableName = $tableRow->TABLE_NAME ?? (array_values((array)$tableRow)[0] ?? null);
            
            if (!$tableName) {
                continue;
            }
            
            try {
                $counts[$tableName] = DB::table($tableName)->count();
            } catch (\Exception $e) {
                // Skip tables that can't be accessed
                $counts[$tableName] = 0;
            }
        }

        return $counts;
    }

    /**
     * Format bytes to human readable format
     */
    protected function formatBytes($bytes, $precision = 2)
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];

        for ($i = 0; $bytes > 1024 && $i < count($units) - 1; $i++) {
            $bytes /= 1024;
        }

        return round($bytes, $precision) . ' ' . $units[$i];
    }
}

