<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ReportController extends Controller
{
    public function visitsMonthly(Request $request)
    {
        $month = $request->query('month'); // expected format YYYY-MM

        if (!is_string($month) || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            $start = now()->startOfMonth();
        } else {
            try {
                $start = Carbon::createFromFormat('Y-m-d', $month . '-01')->startOfMonth();
            } catch (\Exception $e) {
                $start = now()->startOfMonth();
            }
        }

        $end = (clone $start)->endOfMonth();
        $daysInMonth = $start->daysInMonth;

        // Base scope: visits that started within the month
        $base = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$start, $end]);

        // Totals
        $totalVisits = (clone $base)->count();
        
        // Count inquiries (visits with status 'inquiry')
        $totalInquiries = (clone $base)->where('v.status', 'inquiry')->count();

        // By day
        $byDayRows = (clone $base)
            ->selectRaw('DATE(v.start_time) as day, COUNT(*) as count')
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        // By hour (0-23)
        $byHourRows = (clone $base)
            ->selectRaw('HOUR(v.start_time) as hour, COUNT(*) as count, (COUNT(*) / ?) as avg_per_day', [$daysInMonth])
            ->groupBy('hour')
            ->orderBy('hour')
            ->get();

        // By visit type (infer appointment vs walk-in using correlated subquery similar to controller logic)
        $byVisitTypeRows = (clone $base)
            ->selectRaw(
                "CASE WHEN EXISTS (\n" .
                "  SELECT 1 FROM appointments a\n" .
                "  WHERE a.patient_id = v.patient_id\n" .
                "    AND a.service_id = v.service_id\n" .
                "    AND a.date = v.visit_date\n" .
                "    AND a.status IN ('approved','completed')\n" .
                ") THEN 'appointment' ELSE 'walkin' END as visit_type, COUNT(*) as count"
            )
            ->groupBy('visit_type')
            ->orderBy('visit_type')
            ->get();

        // By service
        $byServiceRows = (clone $base)
            ->leftJoin('services as s', 's.id', '=', 'v.service_id')
            ->selectRaw("v.service_id, COALESCE(s.name, '(Unspecified)') as service_name, COUNT(*) as count")
            ->groupBy('v.service_id', 's.name')
            ->orderByDesc('count')
            ->get();

        return response()->json([
            'month' => $start->format('Y-m'),
            'totals' => [
                'visits' => $totalVisits,
                'inquiries' => $totalInquiries,
            ],
            'by_day' => $byDayRows,
            'by_hour' => $byHourRows->map(function ($r) {
                return [
                    'hour' => $r->hour,
                    'count' => $r->count,
                ];
            }),
            'by_hour_avg_per_day' => $byHourRows->map(function ($r) {
                return [
                    'hour' => $r->hour,
                    'avg_per_day' => round((float)$r->avg_per_day, 2),
                ];
            }),
            'by_visit_type' => $byVisitTypeRows,
            'by_service' => $byServiceRows,
        ]);
    }

    public function visitsDaily(Request $request)
    {
        $date = $request->query('date'); // expected format YYYY-MM-DD

        if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $start = now()->startOfDay();
        } else {
            try {
                $start = Carbon::createFromFormat('Y-m-d', $date)->startOfDay();
            } catch (\Exception $e) {
                $start = now()->startOfDay();
            }
        }

        $end = (clone $start)->endOfDay();

        // Base scope: visits that started within the day
        $base = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$start, $end]);

        // By hour (0-23)
        $byHourRows = (clone $base)
            ->selectRaw('HOUR(v.start_time) as hour, COUNT(*) as count')
            ->groupBy('hour')
            ->orderBy('hour')
            ->get();

        // By visit type (infer appointment vs walk-in using correlated subquery)
        $byVisitTypeRows = (clone $base)
            ->selectRaw(
                "CASE WHEN EXISTS (\n" .
                "  SELECT 1 FROM appointments a\n" .
                "  WHERE a.patient_id = v.patient_id\n" .
                "    AND a.service_id = v.service_id\n" .
                "    AND a.date = v.visit_date\n" .
                "    AND a.status IN ('approved','completed')\n" .
                ") THEN 'appointment' ELSE 'walkin' END as visit_type, COUNT(*) as count"
            )
            ->groupBy('visit_type')
            ->orderBy('visit_type')
            ->get();

        // By service with walk-in/appointment breakdown
        $byServiceRows = (clone $base)
            ->leftJoin('services as s', 's.id', '=', 'v.service_id')
            ->selectRaw(
                "v.service_id, " .
                "COALESCE(s.name, '(Unspecified)') as service_name, " .
                "COUNT(*) as count, " .
                "SUM(CASE WHEN EXISTS (\n" .
                "  SELECT 1 FROM appointments a\n" .
                "  WHERE a.patient_id = v.patient_id\n" .
                "    AND a.service_id = v.service_id\n" .
                "    AND a.date = v.visit_date\n" .
                "    AND a.status IN ('approved','completed')\n" .
                ") THEN 0 ELSE 1 END) as walkin, " .
                "SUM(CASE WHEN EXISTS (\n" .
                "  SELECT 1 FROM appointments a\n" .
                "  WHERE a.patient_id = v.patient_id\n" .
                "    AND a.service_id = v.service_id\n" .
                "    AND a.date = v.visit_date\n" .
                "    AND a.status IN ('approved','completed')\n" .
                ") THEN 1 ELSE 0 END) as appointment"
            )
            ->groupBy('v.service_id', 's.name')
            ->orderByDesc('count')
            ->get();

        return response()->json([
            'date' => $start->format('Y-m-d'),
            'by_hour' => $byHourRows->map(function ($r) {
                return [
                    'hour' => $r->hour,
                    'count' => $r->count,
                ];
            }),
            'by_visit_type' => $byVisitTypeRows,
            'by_service' => $byServiceRows,
        ]);
    }

    public function analyticsSummary(Request $request)
    {
        // Accept either 'month' or 'period' (YYYY-MM). Default: current month
        $month = $request->query('month') ?? $request->query('period');
        if (!is_string($month) || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            $start = now()->startOfMonth();
        } else {
            try {
                $start = Carbon::createFromFormat('Y-m-d', $month . '-01')->startOfMonth();
            } catch (\Exception $e) {
                $start = now()->startOfMonth();
            }
        }

        $end = (clone $start)->endOfMonth();
        $prevStart = (clone $start)->subMonth()->startOfMonth();
        $prevEnd = (clone $start)->subMonth()->endOfMonth();

        $safePct = function (float $curr, float $prev): float {
            if ($prev == 0.0) {
                return $curr > 0 ? 100.0 : 0.0;
            }
            return round((($curr - $prev) / $prev) * 100.0, 2);
        };

        // Total visits (started within month)
        $visitsCurr = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$start, $end])
            ->count();
        $visitsPrev = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$prevStart, $prevEnd])
            ->count();

        // Approved appointments (by appointment date)
        $approvedCurr = DB::table('appointments')
            ->where('status', 'approved')
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->count();
        $approvedPrev = DB::table('appointments')
            ->where('status', 'approved')
            ->whereBetween('date', [$prevStart->toDateString(), $prevEnd->toDateString()])
            ->count();

        // No-shows (by appointment date). If schema doesn't include no_show, this will be zero
        $noShowCurr = DB::table('appointments')
            ->where('status', 'no_show')
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->count();
        $noShowPrev = DB::table('appointments')
            ->where('status', 'no_show')
            ->whereBetween('date', [$prevStart->toDateString(), $prevEnd->toDateString()])
            ->count();

        // Average visit duration (minutes) for completed/finished visits with end_time
        // Use database-agnostic SQL for compatibility with SQLite and MySQL
        $avgDurCurr = (float) (DB::table('patient_visits')
            ->whereNotNull('start_time')
            ->whereNotNull('end_time')
            ->whereBetween('start_time', [$start, $end])
            ->selectRaw(DB::connection()->getDriverName() === 'sqlite' 
                ? 'AVG((julianday(end_time) - julianday(start_time)) * 1440) as avg_min'
                : 'AVG(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as avg_min')
            ->value('avg_min') ?? 0);
        $avgDurPrev = (float) (DB::table('patient_visits')
            ->whereNotNull('start_time')
            ->whereNotNull('end_time')
            ->whereBetween('start_time', [$prevStart, $prevEnd])
            ->selectRaw(DB::connection()->getDriverName() === 'sqlite' 
                ? 'AVG((julianday(end_time) - julianday(start_time)) * 1440) as avg_min'
                : 'AVG(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as avg_min')
            ->value('avg_min') ?? 0);

        // Top services (by visits) - exclude services marked as excluded from analytics
        $topServicesCurr = DB::table('patient_visits as v')
            ->leftJoin('services as s', 's.id', '=', 'v.service_id')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$start, $end])
            ->where(function($query) {
                $query->whereNull('s.is_excluded_from_analytics')
                      ->orWhere('s.is_excluded_from_analytics', false);
            })
            ->selectRaw('v.service_id, COALESCE(s.name, "(Unspecified)") as service_name, COUNT(*) as count')
            ->groupBy('v.service_id', 's.name')
            ->orderByDesc('count')
            ->limit(5)
            ->get();
        $serviceIds = $topServicesCurr->pluck('service_id')->filter()->all();
        $prevCountsByService = collect();
        if (!empty($serviceIds)) {
            $prevCountsByService = DB::table('patient_visits as v')
                ->whereNotNull('v.start_time')
                ->whereBetween('v.start_time', [$prevStart, $prevEnd])
                ->whereIn('v.service_id', $serviceIds)
                ->selectRaw('v.service_id, COUNT(*) as count')
                ->groupBy('v.service_id')
                ->pluck('count', 'service_id');
        }
        $topServices = $topServicesCurr->map(function ($row) use ($prevCountsByService, $safePct) {
            $prev = (float) ($prevCountsByService[$row->service_id] ?? 0);
            $curr = (float) $row->count;
            return [
                'service_id' => $row->service_id,
                'service_name' => $row->service_name,
                'count' => (int) $curr,
                'prev_count' => (int) $prev,
                'pct_change' => $safePct($curr, $prev),
            ];
        });

        // Payment method share (cash, hmo, maya) from paid payments in the month
        // Note: Excludes refunded payments (status = 'refunded') since we filter for 'paid' only
        $payCurr = DB::table('payments')
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$start, $end])
            ->whereIn('method', ['cash', 'hmo', 'maya'])
            ->selectRaw('method, COUNT(*) as count')
            ->groupBy('method')
            ->pluck('count', 'method');
        $payPrev = DB::table('payments')
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$prevStart, $prevEnd])
            ->whereIn('method', ['cash', 'hmo', 'maya'])
            ->selectRaw('method, COUNT(*) as count')
            ->groupBy('method')
            ->pluck('count', 'method');

        $cashCurr = (int) ($payCurr['cash'] ?? 0);
        $hmoCurr = (int) ($payCurr['hmo'] ?? 0);
        $mayaCurr = (int) ($payCurr['maya'] ?? 0);
        $cashPrev = (int) ($payPrev['cash'] ?? 0);
        $hmoPrev = (int) ($payPrev['hmo'] ?? 0);
        $mayaPrev = (int) ($payPrev['maya'] ?? 0);
        $denomCurr = max(1, $cashCurr + $hmoCurr + $mayaCurr);
        $denomPrev = max(1, $cashPrev + $hmoPrev + $mayaPrev);
        $cashShareCurr = round(($cashCurr / $denomCurr) * 100.0, 2);
        $hmoShareCurr = round(($hmoCurr / $denomCurr) * 100.0, 2);
        $mayaShareCurr = round(($mayaCurr / $denomCurr) * 100.0, 2);
        $cashSharePrev = round(($cashPrev / $denomPrev) * 100.0, 2);
        $hmoSharePrev = round(($hmoPrev / $denomPrev) * 100.0, 2);
        $mayaSharePrev = round(($mayaPrev / $denomPrev) * 100.0, 2);

        // Revenue by service (from paid payments linked to visits) - exclude services marked as excluded from analytics
        // Note: Excludes refunded payments (status = 'refunded') since we filter for 'paid' only
        $revenueByServiceCurr = DB::table('payments as p')
            ->join('patient_visits as v', 'p.patient_visit_id', '=', 'v.id')
            ->leftJoin('services as s', 's.id', '=', 'v.service_id')
            ->where('p.status', 'paid')
            ->whereBetween('p.paid_at', [$start, $end])
            ->where(function($query) {
                $query->whereNull('s.is_excluded_from_analytics')
                      ->orWhere('s.is_excluded_from_analytics', false);
            })
            ->selectRaw('v.service_id, COALESCE(s.name, "(Unspecified)") as service_name, SUM(p.amount_paid) as revenue')
            ->groupBy('v.service_id', 's.name')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get();

        $revenueByServicePrev = DB::table('payments as p')
            ->join('patient_visits as v', 'p.patient_visit_id', '=', 'v.id')
            ->leftJoin('services as s', 's.id', '=', 'v.service_id')
            ->where('p.status', 'paid')
            ->whereBetween('p.paid_at', [$prevStart, $prevEnd])
            ->selectRaw('v.service_id, SUM(p.amount_paid) as revenue')
            ->groupBy('v.service_id')
            ->pluck('revenue', 'service_id');

        $topRevenueServices = $revenueByServiceCurr->map(function ($row) use ($revenueByServicePrev, $safePct) {
            $prev = (float) ($revenueByServicePrev[$row->service_id] ?? 0);
            $curr = (float) $row->revenue;
            return [
                'service_id' => $row->service_id,
                'service_name' => $row->service_name,
                'revenue' => round($curr, 2),
                'prev_revenue' => round($prev, 2),
                'pct_change' => $safePct($curr, $prev),
            ];
        });

        // Total revenue for the month
        // Note: Excludes refunded payments (status = 'refunded') since we filter for 'paid' only
        $totalRevenueCurr = DB::table('payments')
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$start, $end])
            ->sum('amount_paid');

        $totalRevenuePrev = DB::table('payments')
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$prevStart, $prevEnd])
            ->sum('amount_paid');

        // Patient follow-up rate (patients who returned within 3-4 months)
        // Look at patients who had their first visit 3-4 months ago and see if they returned
        $followUpStart = (clone $start)->subMonths(4)->startOfMonth();
        $followUpEnd = (clone $start)->subMonths(3)->endOfMonth();
        
        // Get patients who had their first visit 3-4 months ago
        $firstTimePatients = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$followUpStart, $followUpEnd])
            ->selectRaw('v.patient_id, MIN(v.start_time) as first_visit')
            ->groupBy('v.patient_id')
            ->get();
        
        $totalFirstTimePatients = $firstTimePatients->count();
        $returnedPatients = 0;
        
        if ($totalFirstTimePatients > 0) {
            // Check if these patients returned within 3-4 months after their first visit
            foreach ($firstTimePatients as $patient) {
                $firstVisit = Carbon::parse($patient->first_visit);
                $followUpWindowStart = $firstVisit->copy()->addMonths(3);
                $followUpWindowEnd = $firstVisit->copy()->addMonths(4);
                
                $hasReturned = DB::table('patient_visits')
                    ->where('patient_id', $patient->patient_id)
                    ->whereNotNull('start_time')
                    ->whereBetween('start_time', [$followUpWindowStart, $followUpWindowEnd])
                    ->exists();
                
                if ($hasReturned) {
                    $returnedPatients++;
                }
            }
        }
        
        $followUpRateCurr = $totalFirstTimePatients > 0 
            ? round(($returnedPatients / $totalFirstTimePatients) * 100.0, 2) 
            : 0;
        
        // Calculate previous month's follow-up rate for comparison
        $prevFollowUpStart = (clone $prevStart)->subMonths(4)->startOfMonth();
        $prevFollowUpEnd = (clone $prevStart)->subMonths(3)->endOfMonth();
        
        $prevFirstTimePatients = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$prevFollowUpStart, $prevFollowUpEnd])
            ->selectRaw('v.patient_id, MIN(v.start_time) as first_visit')
            ->groupBy('v.patient_id')
            ->get();
        
        $prevTotalFirstTimePatients = $prevFirstTimePatients->count();
        $prevReturnedPatients = 0;
        
        if ($prevTotalFirstTimePatients > 0) {
            foreach ($prevFirstTimePatients as $patient) {
                $firstVisit = Carbon::parse($patient->first_visit);
                $followUpWindowStart = $firstVisit->copy()->addMonths(3);
                $followUpWindowEnd = $firstVisit->copy()->addMonths(4);
                
                $hasReturned = DB::table('patient_visits')
                    ->where('patient_id', $patient->patient_id)
                    ->whereNotNull('start_time')
                    ->whereBetween('start_time', [$followUpWindowStart, $followUpWindowEnd])
                    ->exists();
                
                if ($hasReturned) {
                    $prevReturnedPatients++;
                }
            }
        }
        
        $followUpRatePrev = $prevTotalFirstTimePatients > 0 
            ? round(($prevReturnedPatients / $prevTotalFirstTimePatients) * 100.0, 2) 
            : 0;

        // Simple daily series for sparkline on frontend
        $visitsByDay = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$start, $end])
            ->selectRaw('DATE(v.start_time) as day, COUNT(*) as count')
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        // Alerts
        $alerts = [];
        if ($approvedCurr > 0) {
            $noShowRate = round(($noShowCurr / max(1, $approvedCurr)) * 100.0, 2);
            if ($noShowRate >= 20.0) {
                $alerts[] = [
                    'type' => 'warning',
                    'message' => "High no-show rate: {$noShowRate}% of approved appointments. Consider implementing reminder systems or appointment confirmation calls.",
                ];
            }
        }
        if ($avgDurCurr >= 100) {
            $alerts[] = [
                'type' => 'info',
                'message' => 'Average visit duration is unusually long (>= 100 minutes). This may indicate complex procedures or potential scheduling inefficiencies.',
            ];
        } elseif ($avgDurCurr > 0 && $avgDurCurr <= 25) {
            $alerts[] = [
                'type' => 'info',
                'message' => 'Average visit duration is quite short (<= 25 minutes). Consider if consultations are thorough enough or if quick procedures are being scheduled efficiently.',
            ];
        }
        if (!empty($topServices[0])) {
            $top = $topServices[0];
            if ($visitsCurr > 0 && ($top['count'] / $visitsCurr) >= 0.5) {
                $alerts[] = [
                    'type' => 'info',
                    'message' => 'One service accounts for over 50% of visits. Consider balancing workload across different services or promoting underutilized services.',
                ];
            }
        }
        
        // Add follow-up rate alerts
        if ($totalFirstTimePatients > 0) {
            if ($followUpRateCurr < 20) {
                $alerts[] = [
                    'type' => 'warning',
                    'message' => "Low patient follow-up rate: {$followUpRateCurr}% ({$returnedPatients}/{$totalFirstTimePatients} patients). Consider implementing follow-up calls, appointment reminders, or patient satisfaction surveys.",
                ];
            } elseif ($followUpRateCurr >= 50) {
                $alerts[] = [
                    'type' => 'info',
                    'message' => "Excellent patient follow-up rate: {$followUpRateCurr}% ({$returnedPatients}/{$totalFirstTimePatients} patients). This indicates strong patient satisfaction and retention.",
                ];
            } elseif ($followUpRateCurr >= 30) {
                $alerts[] = [
                    'type' => 'info',
                    'message' => "Good patient follow-up rate: {$followUpRateCurr}% ({$returnedPatients}/{$totalFirstTimePatients} patients). Consider strategies to improve further.",
                ];
            }
        }
        
        // Add payment method insights as alerts
        $shareSpike = $hmoShareCurr - $hmoSharePrev;
        if ($shareSpike >= 15.0) {
            $alerts[] = [
                'type' => 'info',
                'message' => 'HMO share increased sharply vs last month (+'.round($shareSpike, 1).' pp). Monitor insurer approval times and patient satisfaction with HMO processes.',
            ];
        }
        
        // Add visit volume alerts
        if ($visitsCurr > 0) {
            $visitChange = $safePct((float) $visitsCurr, (float) $visitsPrev);
            if ($visitChange <= -20) {
                $alerts[] = [
                    'type' => 'warning',
                    'message' => "Significant drop in visits: {$visitChange}% vs last month. Review marketing efforts, seasonal factors, or external competition.",
                ];
            } elseif ($visitChange >= 30) {
                $alerts[] = [
                    'type' => 'info',
                    'message' => "Strong growth in visits: +{$visitChange}% vs last month. Consider capacity planning and staff scheduling adjustments.",
                ];
            }
        }

        // Check if there's data for last month - only show insights if there's meaningful data
        $hasLastMonthData = $visitsPrev > 0 || $approvedPrev > 0 || $totalRevenuePrev > 0;
        
        // Check for clinic closures based on weekly schedule
        $clinicClosureInfo = $this->checkClinicClosures($start, $end);
        
        // Generate actionable insights with error handling - only if there's data from last month
        $insights = [];
        if ($hasLastMonthData) {
            try {
                Log::info('Generating insights with data: visits=' . $visitsCurr . ', revenue=' . $totalRevenueCurr . ', avgDur=' . $avgDurCurr);
                $insights = $this->generateActionableInsights($visitsCurr, $visitsPrev, $totalRevenueCurr, $totalRevenuePrev, $topServices, $topRevenueServices, $avgDurCurr, $noShowCurr, $approvedCurr, $followUpRateCurr, $cashShareCurr, $hmoShareCurr, $mayaShareCurr, $start, $end);
                Log::info('Generated ' . count($insights) . ' actionable insights');
            } catch (\Exception $e) {
                // Log the error but don't break the entire analytics
                Log::error('Error generating actionable insights: ' . $e->getMessage());
                Log::error('Stack trace: ' . $e->getTraceAsString());
                $insights = [];
            }
        } else {
            Log::info('No actionable insights generated - insufficient data from last month');
        }

        // Debug: Log the insights before returning
        Log::info('Final insights count: ' . count($insights));
        Log::info('Insights data: ' . json_encode($insights));

        return response()->json([
            'month' => $start->format('Y-m'),
            'previous_month' => $prevStart->format('Y-m'),
            'has_last_month_data' => $hasLastMonthData,
            'clinic_closure_info' => $clinicClosureInfo,
            'kpis' => [
                'total_visits' => [
                    'value' => (int) $visitsCurr,
                    'prev' => (int) $visitsPrev,
                    'pct_change' => $safePct((float) $visitsCurr, (float) $visitsPrev),
                ],
                'approved_appointments' => [
                    'value' => (int) $approvedCurr,
                    'prev' => (int) $approvedPrev,
                    'pct_change' => $safePct((float) $approvedCurr, (float) $approvedPrev),
                ],
                'no_shows' => [
                    'value' => (int) $noShowCurr,
                    'prev' => (int) $noShowPrev,
                    'pct_change' => $safePct((float) $noShowCurr, (float) $noShowPrev),
                ],
                'avg_visit_duration_min' => [
                    'value' => round($avgDurCurr, 2),
                    'prev' => round($avgDurPrev, 2),
                    'pct_change' => $safePct($avgDurCurr, $avgDurPrev),
                ],
                'patient_follow_up_rate' => [
                    'value' => $followUpRateCurr,
                    'prev' => $followUpRatePrev,
                    'pct_change' => $safePct($followUpRateCurr, $followUpRatePrev),
                    'total_first_time_patients' => $totalFirstTimePatients,
                    'returned_patients' => $returnedPatients,
                ],
                'total_revenue' => [
                    'value' => round($totalRevenueCurr, 2),
                    'prev' => round($totalRevenuePrev, 2),
                    'pct_change' => $safePct($totalRevenueCurr, $totalRevenuePrev),
                ],
                'payment_method_share' => [
                    'cash' => [
                        'count' => $cashCurr,
                        'share_pct' => $cashShareCurr,
                        'prev_share_pct' => $cashSharePrev,
                        'pct_point_change' => round($cashShareCurr - $cashSharePrev, 2),
                    ],
                    'hmo' => [
                        'count' => $hmoCurr,
                        'share_pct' => $hmoShareCurr,
                        'prev_share_pct' => $hmoSharePrev,
                        'pct_point_change' => round($hmoShareCurr - $hmoSharePrev, 2),
                    ],
                    'maya' => [
                        'count' => $mayaCurr,
                        'share_pct' => $mayaShareCurr,
                        'prev_share_pct' => $mayaSharePrev,
                        'pct_point_change' => round($mayaShareCurr - $mayaSharePrev, 2),
                    ],
                ],
            ],
            'top_services' => $topServices,
            'top_revenue_services' => $topRevenueServices,
            'series' => [
                'visits_by_day' => $visitsByDay,
            ],
            'alerts' => $alerts,
            'insights' => $insights,
        ]);
    }

    public function analyticsComparison(Request $request)
    {
        // Accept either 'month' or 'period' (YYYY-MM). Default: current month
        $month = $request->query('month') ?? $request->query('period');
        if (!is_string($month) || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            $start = now()->startOfMonth();
        } else {
            try {
                $start = Carbon::createFromFormat('Y-m-d', $month . '-01')->startOfMonth();
            } catch (\Exception $e) {
                $start = now()->startOfMonth();
            }
        }

        $end = (clone $start)->endOfMonth();
        $prevStart = (clone $start)->subMonth()->startOfMonth();
        $prevEnd = (clone $start)->subMonth()->endOfMonth();

        // Total visits
        $visitsCurr = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$start, $end])
            ->count();
        $visitsPrev = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$prevStart, $prevEnd])
            ->count();

        // Approved appointments
        $approvedCurr = DB::table('appointments')
            ->where('status', 'approved')
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->count();
        $approvedPrev = DB::table('appointments')
            ->where('status', 'approved')
            ->whereBetween('date', [$prevStart->toDateString(), $prevEnd->toDateString()])
            ->count();

        // No-shows
        $noShowCurr = DB::table('appointments')
            ->where('status', 'no_show')
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->count();
        $noShowPrev = DB::table('appointments')
            ->where('status', 'no_show')
            ->whereBetween('date', [$prevStart->toDateString(), $prevEnd->toDateString()])
            ->count();

        // Average visit duration
        $avgDurCurr = (float) (DB::table('patient_visits')
            ->whereNotNull('start_time')
            ->whereNotNull('end_time')
            ->whereBetween('start_time', [$start, $end])
            ->selectRaw('AVG(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as avg_min')
            ->value('avg_min') ?? 0);
        $avgDurPrev = (float) (DB::table('patient_visits')
            ->whereNotNull('start_time')
            ->whereNotNull('end_time')
            ->whereBetween('start_time', [$prevStart, $prevEnd])
            ->selectRaw('AVG(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as avg_min')
            ->value('avg_min') ?? 0);

        // Total revenue
        // Note: Excludes refunded payments (status = 'refunded') since we filter for 'paid' only
        $totalRevenueCurr = DB::table('payments')
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$start, $end])
            ->sum('amount_paid');
        $totalRevenuePrev = DB::table('payments')
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$prevStart, $prevEnd])
            ->sum('amount_paid');

        return response()->json([
            'metrics' => [
                [
                    'label' => 'Total Visits',
                    'this_month' => (int) $visitsCurr,
                    'last_month' => (int) $visitsPrev,
                ],
                [
                    'label' => 'Approved Appointments',
                    'this_month' => (int) $approvedCurr,
                    'last_month' => (int) $approvedPrev,
                ],
                [
                    'label' => 'No-Shows',
                    'this_month' => (int) $noShowCurr,
                    'last_month' => (int) $noShowPrev,
                ],
                [
                    'label' => 'Avg Visit Duration',
                    'this_month' => round($avgDurCurr, 1),
                    'last_month' => round($avgDurPrev, 1),
                ],
                [
                    'label' => 'Total Revenue',
                    'this_month' => round($totalRevenueCurr, 2),
                    'last_month' => round($totalRevenuePrev, 2),
                ],
            ],
        ]);
    }

    public function analyticsTrend(Request $request)
    {
        $months = (int) $request->query('months', 6);
        $months = max(3, min(24, $months)); // Extended limit to support yearly data
        $yearly = $request->query('yearly', false);
        $startDate = $request->query('start_date');
        $endDate = $request->query('end_date');

        // Handle custom date range
        if ($startDate && $endDate) {
            $start = \Carbon\Carbon::parse($startDate)->startOfDay();
            $end = \Carbon\Carbon::parse($endDate)->endOfDay();
            
            // Calculate period based on date range
            $diffInDays = $start->diffInDays($end);
            $diffInMonths = $start->diffInMonths($end);
            $diffInYears = $start->diffInYears($end);
            
            $labels = [];
            $visits = [];
            $appointments = [];
            $revenue = [];
            $loss = [];
            
            if ($diffInYears >= 1 || $yearly) {
                // Yearly aggregation
                $currentYear = $start->copy()->startOfYear();
                $endYear = $end->copy()->endOfYear();
                
                while ($currentYear->lte($endYear)) {
                    $yearStart = $currentYear->copy()->startOfYear();
                    $yearEnd = $currentYear->copy()->endOfYear();
                    
                    // Adjust start/end if they're within the custom range
                    if ($yearStart->lt($start)) $yearStart = $start->copy();
                    if ($yearEnd->gt($end)) $yearEnd = $end->copy();
                    
                    $labels[] = $yearStart->format('Y');
                    
                    // Visits for this year
                    $yearVisits = DB::table('patient_visits as v')
                        ->whereNotNull('v.start_time')
                        ->whereBetween('v.start_time', [$yearStart, $yearEnd])
                        ->count();
                    $visits[] = (int) $yearVisits;
                    
                    // Approved appointments for this year
                    $yearAppointments = DB::table('appointments')
                        ->where('status', 'approved')
                        ->whereBetween('date', [$yearStart->toDateString(), $yearEnd->toDateString()])
                        ->count();
                    $appointments[] = (int) $yearAppointments;
                    
                    // Revenue for this year (excludes refunded payments - status = 'refunded')
                    $yearRevenue = DB::table('payments')
                        ->where('status', 'paid')
                        ->whereBetween('paid_at', [$yearStart, $yearEnd])
                        ->sum('amount_paid');
                    $revenue[] = round((float) $yearRevenue, 2);
                    
                    // Loss cost for this year
                    $yearLossCost = DB::table('inventory_movements as im')
                        ->join('inventory_batches as ib', 'im.batch_id', '=', 'ib.id')
                        ->where('im.type', 'adjust')
                        ->whereIn('im.adjust_reason', ['expired', 'theft'])
                        ->whereBetween('im.created_at', [$yearStart, $yearEnd])
                        ->selectRaw('SUM(im.quantity * ib.cost_per_unit) as total_cost')
                        ->value('total_cost');
                    $loss[] = round((float) $yearLossCost, 2);
                    
                    $currentYear->addYear();
                }
            } else {
                // Monthly aggregation for custom range
                $currentMonth = $start->copy()->startOfMonth();
                $endMonth = $end->copy()->endOfMonth();
                
                while ($currentMonth->lte($endMonth)) {
                    $monthStart = $currentMonth->copy()->startOfMonth();
                    $monthEnd = $currentMonth->copy()->endOfMonth();
                    
                    // Adjust start/end if they're within the custom range
                    if ($monthStart->lt($start)) $monthStart = $start->copy();
                    if ($monthEnd->gt($end)) $monthEnd = $end->copy();
                    
                    $labels[] = $monthStart->format('M Y');
                    
                    // Visits for this month
                    $monthVisits = DB::table('patient_visits as v')
                        ->whereNotNull('v.start_time')
                        ->whereBetween('v.start_time', [$monthStart, $monthEnd])
                        ->count();
                    $visits[] = (int) $monthVisits;
                    
                    // Approved appointments for this month
                    $monthAppointments = DB::table('appointments')
                        ->where('status', 'approved')
                        ->whereBetween('date', [$monthStart->toDateString(), $monthEnd->toDateString()])
                        ->count();
                    $appointments[] = (int) $monthAppointments;
                    
                    // Revenue for this month (excludes refunded payments - status = 'refunded')
                    $monthRevenue = DB::table('payments')
                        ->where('status', 'paid')
                        ->whereBetween('paid_at', [$monthStart, $monthEnd])
                        ->sum('amount_paid');
                    $revenue[] = round((float) $monthRevenue, 2);
                    
                    // Loss cost for this month
                    $monthLossCost = DB::table('inventory_movements as im')
                        ->join('inventory_batches as ib', 'im.batch_id', '=', 'ib.id')
                        ->where('im.type', 'adjust')
                        ->whereIn('im.adjust_reason', ['expired', 'theft'])
                        ->whereBetween('im.created_at', [$monthStart, $monthEnd])
                        ->selectRaw('SUM(im.quantity * ib.cost_per_unit) as total_cost')
                        ->value('total_cost');
                    $loss[] = round((float) $monthLossCost, 2);
                    
                    $currentMonth->addMonth();
                }
            }
        } else {
            // Default behavior - check if yearly is requested
            if ($yearly) {
                // Yearly aggregation for default behavior
                $end = now()->endOfYear();
                $start = (clone $end)->subYears($months - 1)->startOfYear();

                $labels = [];
                $visits = [];
                $appointments = [];
                $revenue = [];
                $loss = [];

                for ($i = 0; $i < $months; $i++) {
                    $yearStart = (clone $start)->addYears($i)->startOfYear();
                    $yearEnd = (clone $yearStart)->endOfYear();
                    
                    $labels[] = $yearStart->format('Y');
                    
                    // Visits for this year
                    $yearVisits = DB::table('patient_visits as v')
                        ->whereNotNull('v.start_time')
                        ->whereBetween('v.start_time', [$yearStart, $yearEnd])
                        ->count();
                    $visits[] = (int) $yearVisits;
                    
                    // Approved appointments for this year
                    $yearAppointments = DB::table('appointments')
                        ->where('status', 'approved')
                        ->whereBetween('date', [$yearStart->toDateString(), $yearEnd->toDateString()])
                        ->count();
                    $appointments[] = (int) $yearAppointments;
                    
                    // Revenue for this year (excludes refunded payments - status = 'refunded')
                    $yearRevenue = DB::table('payments')
                        ->where('status', 'paid')
                        ->whereBetween('paid_at', [$yearStart, $yearEnd])
                        ->sum('amount_paid');
                    $revenue[] = round((float) $yearRevenue, 2);
                    
                    // Loss cost for this year
                    $yearLossCost = DB::table('inventory_movements as im')
                        ->join('inventory_batches as ib', 'im.batch_id', '=', 'ib.id')
                        ->where('im.type', 'adjust')
                        ->whereIn('im.adjust_reason', ['expired', 'theft'])
                        ->whereBetween('im.created_at', [$yearStart, $yearEnd])
                        ->selectRaw('SUM(im.quantity * ib.cost_per_unit) as total_cost')
                        ->value('total_cost');
                    $loss[] = round((float) $yearLossCost, 2);
                }
            } else {
                // Monthly aggregation for default behavior
                $end = now()->endOfMonth();
                $start = (clone $end)->subMonths($months - 1)->startOfMonth();

                $labels = [];
                $visits = [];
                $appointments = [];
                $revenue = [];
                $loss = [];

                for ($i = 0; $i < $months; $i++) {
                    $monthStart = (clone $start)->addMonths($i)->startOfMonth();
                    $monthEnd = (clone $monthStart)->endOfMonth();
                    
                    $labels[] = $monthStart->format('M');
                    
                    // Visits for this month
                    $monthVisits = DB::table('patient_visits as v')
                        ->whereNotNull('v.start_time')
                        ->whereBetween('v.start_time', [$monthStart, $monthEnd])
                        ->count();
                    $visits[] = (int) $monthVisits;
                    
                    // Approved appointments for this month
                    $monthAppointments = DB::table('appointments')
                        ->where('status', 'approved')
                        ->whereBetween('date', [$monthStart->toDateString(), $monthEnd->toDateString()])
                        ->count();
                    $appointments[] = (int) $monthAppointments;
                    
                    // Revenue for this month (excludes refunded payments - status = 'refunded')
                    $monthRevenue = DB::table('payments')
                        ->where('status', 'paid')
                        ->whereBetween('paid_at', [$monthStart, $monthEnd])
                        ->sum('amount_paid');
                    $revenue[] = round((float) $monthRevenue, 2);
                    
                    // Loss cost for this month (expired + theft inventory adjustments)
                    $monthLossCost = DB::table('inventory_movements as im')
                        ->join('inventory_batches as ib', 'im.batch_id', '=', 'ib.id')
                        ->where('im.type', 'adjust')
                        ->whereIn('im.adjust_reason', ['expired', 'theft'])
                        ->whereBetween('im.created_at', [$monthStart, $monthEnd])
                        ->selectRaw('SUM(im.quantity * ib.cost_per_unit) as total_cost')
                        ->value('total_cost');
                    $loss[] = round((float) $monthLossCost, 2);
                }
            }
        }

        return response()->json([
            'labels' => $labels,
            'visits' => $visits,
            'appointments' => $appointments,
            'revenue' => $revenue,
            'loss' => $loss,
        ]);
    }

    /**
     * Generate comprehensive actionable insights based on analytics data
     */
    private function generateActionableInsights($visitsCurr, $visitsPrev, $totalRevenueCurr, $totalRevenuePrev, $topServices, $topRevenueServices, $avgDurCurr, $noShowCurr, $approvedCurr, $followUpRateCurr, $cashShareCurr, $hmoShareCurr, $mayaShareCurr, $start, $end)
    {
        $insights = [];
        
        // Helper function for percentage change
        $safePct = function (float $curr, float $prev): float {
            if ($prev == 0.0) {
                return $curr > 0 ? 100.0 : 0.0;
            }
            return round((($curr - $prev) / $prev) * 100.0, 2);
        };

        // Test insights removed - now generating real insights based on data

        // Continue with actual insights generation

        // 1. REVENUE OPTIMIZATION INSIGHTS
        $revenueChange = $safePct($totalRevenueCurr, $totalRevenuePrev);
        if ($revenueChange < -5) { // Lowered from -10 to -5
            // Get specific revenue decline data
            $prevStart = (clone $start)->subMonth()->startOfMonth();
            $prevEnd = (clone $start)->subMonth()->endOfMonth();
            $decliningServices = $this->getDecliningServices($start, $end, $prevStart, $prevEnd);
            $lowPerformingServices = $this->getLowPerformingHighValueServices($start, $end);
            
            $actions = [];
            
            // Specific service actions
            if (!empty($decliningServices)) {
                $service = $decliningServices[0];
                $actions[] = "Urgent: '{$service['service_name']}' revenue dropped by {$service['revenue_change']}% - investigate pricing, quality, or competition";
            }
            
            if (!empty($lowPerformingServices)) {
                $service = $lowPerformingServices[0];
                $actions[] = "Promote '{$service['service_name']}' (₱{$service['price']}) - only {$service['visits']} visits this month despite high value";
            }
            
            // Specific revenue actions
            $actions[] = "Implement 15% discount on top 3 underperforming services for next 2 weeks";
            $actions[] = "Create service bundles: combine declining services with popular ones at 20% bundle discount";
            $actions[] = "Send targeted SMS to patients who haven't visited in 3+ months with specific service offers";
            $actions[] = "Review and adjust pricing for services with >30% decline - consider 10-15% price reduction";
            
            $revenueLoss = $totalRevenuePrev - $totalRevenueCurr;
            $decliningServiceText = count($decliningServices) > 0 ? " Primary concern: {$decliningServices[0]['service_name']} performance." : "";
            
            $insights[] = [
                'category' => 'revenue_optimization',
                'priority' => 'high',
                'title' => 'Revenue Decline Requires Immediate Attention',
                'description' => "Revenue down " . round(abs($revenueChange)) . "% this month (₱" . number_format($revenueLoss, 0) . " impact).{$decliningServiceText}",
                'actions' => $actions,
                'impact' => 'High - Direct financial impact'
            ];
        } elseif ($revenueChange > 10) { // Lowered from 20 to 10
            $insights[] = [
                'category' => 'revenue_optimization',
                'priority' => 'medium',
                'title' => 'Excellent Revenue Performance',
                'description' => "Revenue increased by " . round($revenueChange) . "% this month. Outstanding growth that should be sustained and replicated.",
                'actions' => [
                    'Document and maintain current successful strategies',
                    'Consider expanding capacity to capitalize on growth momentum',
                    'Invest in staff development to handle increased demand',
                    'Create playbook of successful practices for future reference'
                ],
                'impact' => 'Medium - Growth sustainability'
            ];
        }

        // 2. SERVICE PERFORMANCE INSIGHTS
        if (!empty($topServices)) {
            $topService = $topServices[0];
            $serviceConcentration = $visitsCurr > 0 ? ($topService['count'] / $visitsCurr) * 100 : 0;
            
            if ($serviceConcentration > 40) { // Lowered from 60 to 40
                $insights[] = [
                    'category' => 'service_optimization',
                    'priority' => 'medium',
                    'title' => 'Service Portfolio Needs Diversification',
                    'description' => "{$topService['service_name']} represents " . round($serviceConcentration) . "% of all visits. Consider balancing service mix for better risk management.",
                    'actions' => [
                        'Launch targeted campaigns to promote underperforming services',
                        'Develop service bundles to encourage service diversification',
                        'Train staff on effective cross-selling and upselling techniques',
                        'Create seasonal promotional campaigns for low-performing services'
                    ],
                    'impact' => 'Medium - Business diversification'
                ];
            }

            // Identify declining services
            foreach ($topServices as $service) {
                if ($service['pct_change'] < -15 && $service['count'] > 3) { // Lowered thresholds
                    $insights[] = [
                        'category' => 'service_optimization',
                        'priority' => 'medium',
                        'title' => 'Service Performance Needs Attention',
                        'description' => "{$service['service_name']} visits declined by " . round(abs($service['pct_change'])) . "% this month. Requires investigation and intervention.",
                        'actions' => [
                            'Conduct analysis of decline factors (pricing, quality, competition)',
                            'Develop promotional pricing strategy or service packages',
                            'Review and improve service delivery processes',
                            'Collect patient feedback to identify improvement opportunities'
                        ],
                        'impact' => 'Medium - Service portfolio health'
                    ];
                }
            }
        }

        // 3. OPERATIONAL EFFICIENCY INSIGHTS
        if ($avgDurCurr > 60) { // Lowered from 90 to 60
            $insights[] = [
                'category' => 'operational_efficiency',
                'priority' => 'high',
                'title' => 'Extended Visit Times Impacting Efficiency',
                'description' => "Average visit duration is " . round($avgDurCurr) . " minutes, well above optimal range. This may indicate scheduling or process inefficiencies.",
                'actions' => [
                    'Review and optimize appointment scheduling and time allocation',
                    'Identify and address bottlenecks in service delivery processes',
                    'Provide staff training on effective time management techniques',
                    'Implement process improvements for frequently performed procedures'
                ],
                'impact' => 'High - Capacity and patient satisfaction'
            ];
        } elseif ($avgDurCurr < 45 && $visitsCurr > 10) { // Adjusted thresholds
            $insights[] = [
                'category' => 'operational_efficiency',
                'priority' => 'medium',
                'title' => 'Opportunity to Increase Revenue Per Visit',
                'description' => "Average visit duration is " . round($avgDurCurr) . " minutes. Consider opportunities to provide additional value and services.",
                'actions' => [
                    'Train staff on effective upselling and cross-selling techniques',
                    'Evaluate consultation thoroughness and patient education opportunities',
                    'Consider offering complementary services during visits',
                    'Implement preventive care reminders and follow-up scheduling'
                ],
                'impact' => 'Medium - Revenue per visit optimization'
            ];
        }

        // 4. PATIENT RETENTION INSIGHTS
        if ($followUpRateCurr < 40) { // Lowered from 25 to 40
            // Get specific retention data
            $retentionData = $this->getDetailedRetentionData($start, $end);
            $lostPatients = $this->getLostPatients($start, $end);
            
            $actions = [];
            
            // Specific retention actions based on data
            if (!empty($lostPatients)) {
                $actions[] = "Call {$lostPatients['count']} patients who haven't returned in 3+ months with personalized follow-up";
                $actions[] = "Send 'We miss you' SMS to {$lostPatients['count']} inactive patients with 20% discount offer";
            }
            
            // Immediate retention actions
            $actions[] = "Implement automated SMS reminders 24 hours before appointments (current reminder rate: estimate 60%)";
            $actions[] = "Create post-visit satisfaction survey sent 2 days after each appointment";
            $actions[] = "Set up 'next appointment booking' during checkout - offer 10% discount for advance booking";
            $actions[] = "Implement loyalty program: 5th visit gets 15% discount, 10th visit gets free cleaning";
            
            // Data-driven actions
            $actions[] = "Review patient feedback from last 30 days - focus on services with lowest satisfaction scores";
            $actions[] = "Train staff to book follow-up appointments before patients leave (target: 80% booking rate)";
            
            $lostPatientsText = !empty($lostPatients) && $lostPatients['count'] > 0 ? " {$lostPatients['count']} patients have not returned recently." : "";
            
            $insights[] = [
                'category' => 'patient_retention',
                'priority' => 'high',
                'title' => 'Patient Retention Needs Immediate Improvement',
                'description' => "Only " . round($followUpRateCurr) . "% of patients return within 3-4 months.{$lostPatientsText} This impacts long-term revenue and growth.",
                'actions' => $actions,
                'impact' => 'High - Long-term business sustainability'
            ];
        } elseif ($followUpRateCurr > 80) { // Raised from 60 to 80
            $insights[] = [
                'category' => 'patient_retention',
                'priority' => 'low',
                'title' => 'Outstanding Patient Retention Performance',
                'description' => "Excellent " . round($followUpRateCurr) . "% patient retention rate demonstrates strong patient satisfaction and loyalty.",
                'actions' => [
                    'Document and replicate successful retention strategies',
                    'Consider implementing referral incentive programs to leverage satisfied patients',
                    'Maintain current high service quality standards',
                    'Explore expansion opportunities based on strong patient base'
                ],
                'impact' => 'Low - Maintain excellence'
            ];
        }

        // 5. APPOINTMENT MANAGEMENT INSIGHTS
        if ($approvedCurr > 0) {
            $noShowRate = ($noShowCurr / $approvedCurr) * 100;
            if ($noShowRate > 5) { // Lowered from 15 to 5
                // Get specific no-show data
                $noShowPatterns = $this->getNoShowPatterns($start, $end);
                $revenueLoss = $this->calculateNoShowRevenueLoss($start, $end);
                
                $actions = [];
                
                // Specific no-show actions
                $actions[] = "Implement automated SMS reminders 24 hours before appointments (current no-show rate: {$noShowRate}%)";
                $actions[] = "Require appointment confirmation 2 hours before scheduled time - send reminder at 4 PM day before";
                $actions[] = "Implement ₱200 no-show fee for appointments cancelled <2 hours before (revenue loss: ₱" . number_format($revenueLoss, 2) . ")";
                
                // Data-driven actions
                if (!empty($noShowPatterns)) {
                    $pattern = $noShowPatterns[0];
                    $actions[] = "Focus on {$pattern['day_of_week']} appointments - {$pattern['no_show_rate']}% no-show rate (highest)";
                }
                
                $actions[] = "Create overbooking strategy: book 1 extra appointment per 4 scheduled for high no-show services";
                $actions[] = "Set up waitlist system - call 3 patients when no-shows occur to fill slots within 30 minutes";
                $actions[] = "Implement 'appointment insurance' - patients pay ₱50 extra for guaranteed same-day rescheduling if they no-show";
                
                $insights[] = [
                    'category' => 'appointment_management',
                    'priority' => 'high',
                    'title' => 'No-Show Rate Impacting Revenue',
                    'description' => "No-show rate of " . round($noShowRate) . "% is costing ₱" . number_format($revenueLoss, 0) . " in lost revenue this month. Immediate action required.",
                    'actions' => $actions,
                    'impact' => 'High - Revenue and capacity optimization'
                ];
            }
        }

        // 6. PAYMENT METHOD INSIGHTS
        if ($mayaShareCurr > 30) { // Lowered from 50 to 30
            $insights[] = [
                'category' => 'payment_optimization',
                'priority' => 'medium',
                'title' => 'Digital Payment Dominance - Monitor Costs',
                'description' => "Digital payments represent " . round($mayaShareCurr) . "% of transactions. Review processing fees to optimize margins.",
                'actions' => [
                    'Analyze Maya transaction fee impact on profit margins',
                    'Negotiate better processing rates with payment provider',
                    'Consider cash discount incentives to reduce processing costs',
                    'Monitor payment processing expenses monthly for optimization'
                ],
                'impact' => 'Medium - Cost optimization'
            ];
        }

        if ($hmoShareCurr > 25) { // Lowered from 40 to 25
            $insights[] = [
                'category' => 'payment_optimization',
                'priority' => 'medium',
                'title' => 'High HMO Revenue Dependency',
                'description' => "HMO payments account for " . round($hmoShareCurr) . "% of revenue. Consider diversifying payment sources for better financial stability.",
                'actions' => [
                    'Develop strategies to diversify payment method mix',
                    'Monitor HMO approval processes and patient satisfaction levels',
                    'Create incentives for direct patient payments',
                    'Review HMO contract terms and reimbursement rate negotiations'
                ],
                'impact' => 'Medium - Payment diversification'
            ];
        }

        // 7. PROMOTION OPPORTUNITIES
        $promotionOpportunities = $this->identifyPromotionOpportunities($topServices, $topRevenueServices, $start, $end);
        if (!empty($promotionOpportunities)) {
            $insights[] = [
                'category' => 'marketing_opportunities',
                'priority' => 'medium',
                'title' => 'Strategic Promotion Opportunities Available',
                'description' => 'Several services show strong potential for growth through targeted marketing campaigns and promotional strategies.',
                'actions' => $promotionOpportunities,
                'impact' => 'Medium - Revenue growth potential'
            ];
        }

        // 8. CAPACITY PLANNING INSIGHTS (already handled above in the main method)

        // Ensure we always return at least the test insights
        if (empty($insights)) {
            $insights[] = [
                'category' => 'system_test',
                'priority' => 'low',
                'title' => 'No Insights Generated',
                'description' => 'No specific insights were generated based on current data patterns.',
                'actions' => ['Review data patterns and thresholds'],
                'impact' => 'Low - System verification'
            ];
        }

        return $insights;
    }

    /**
     * Identify services that could benefit from promotions
     */
    private function identifyPromotionOpportunities($topServices, $topRevenueServices, $start, $end)
    {
        $opportunities = [];
        
        // Get all services that are not excluded from analytics
        $allServices = DB::table('services')
            ->where('is_active', true)
            ->where(function($query) {
                $query->whereNull('is_excluded_from_analytics')
                      ->orWhere('is_excluded_from_analytics', false);
            })
            ->get();

        // Find services with low performance but high potential
        foreach ($allServices as $service) {
            $currentVisits = DB::table('patient_visits')
                ->where('service_id', $service->id)
                ->whereNotNull('start_time')
                ->whereBetween('start_time', [$start, $end])
                ->count();

            $currentRevenue = DB::table('payments as p')
                ->join('patient_visits as v', 'p.patient_visit_id', '=', 'v.id')
                ->where('v.service_id', $service->id)
                ->where('p.status', 'paid')
                ->whereBetween('p.paid_at', [$start, $end])
                ->sum('p.amount_paid');

            // Identify underperforming services with good margins
            if ($currentVisits < 10 && $service->price > 500) { // Lowered thresholds
                $opportunities[] = "Launch promotional campaign for '{$service->name}' - high-value service with low patient utilization";
            }

            // Identify services with declining trends
            $prevVisits = DB::table('patient_visits')
                ->where('service_id', $service->id)
                ->whereNotNull('start_time')
                ->whereBetween('start_time', [
                    (clone $start)->subMonth()->startOfMonth(),
                    (clone $start)->subMonth()->endOfMonth()
                ])
                ->count();

            if ($prevVisits > 0 && $currentVisits > 0) {
                $decline = (($prevVisits - $currentVisits) / $prevVisits) * 100;
                if ($decline > 15) { // Lowered from 30 to 15
                    $opportunities[] = "Priority intervention needed: '{$service->name}' declined by " . round($decline) . "% - requires immediate marketing attention";
                }
            }
        }

        return $opportunities;
    }

    /**
     * Generate capacity planning insights
     */
    private function generateCapacityInsights($visitsCurr, $visitsPrev, $avgDurCurr, $start, $end)
    {
        $insights = [];
        
        // Calculate daily capacity utilization
        $daysInMonth = $start->daysInMonth;
        $avgVisitsPerDay = $visitsCurr / $daysInMonth;
        $estimatedHoursPerDay = ($avgVisitsPerDay * $avgDurCurr) / 60;
        
        // Assume 8-hour work day
        $capacityUtilization = ($estimatedHoursPerDay / 8) * 100;
        
        if ($capacityUtilization > 70) { // Lowered from 90 to 70
            // Get specific operational data for actionable insights
            $peakHours = $this->getPeakHours($start, $end);
            $avgWaitTime = $this->calculateAverageWaitTime($start, $end);
            $serviceBottlenecks = $this->identifyServiceBottlenecks($start, $end);
            
            $actions = [];
            
            // Specific time-based actions
            if (!empty($peakHours)) {
                $peakHour = $peakHours[0];
                $actions[] = "Reschedule early appointments from {$peakHour['hour']}:00 to less busy hours (currently {$peakHour['count']} visits in this slot)";
            }
            
            // Wait time specific actions
            if ($avgWaitTime > 30) {
                $actions[] = "Add 15-minute buffers between appointments to reduce {$avgWaitTime}-minute average wait times";
            }
            
            // Service-specific actions
            if (!empty($serviceBottlenecks)) {
                $bottleneck = $serviceBottlenecks[0];
                $actions[] = "Block schedule '{$bottleneck['service_name']}' procedures to minimize delays (currently averaging {$bottleneck['avg_duration']} minutes)";
            }
            
            // Operational efficiency actions
            $actions[] = "Allow double-booking for quick consultations during peak periods";
            $actions[] = "Create express service lane for routine cleanings and checkups";
            $actions[] = "Implement pre-visit preparation to reduce chair time by 10-15 minutes";
            
            // Data-driven scheduling actions
            $actions[] = "Optimize appointment spacing based on recent utilization patterns";
            $actions[] = "Stagger staff breaks to maintain full coverage during busy hours";
            
            $peakHourText = !empty($peakHours) ? "Peak activity at {$peakHours[0]['hour']}:00" : "High activity throughout the day";
            $waitTimeText = $avgWaitTime > 0 ? " with {$avgWaitTime}-minute average wait times" : "";
            
            $insights[] = [
                'category' => 'capacity_planning',
                'priority' => 'high',
                'title' => 'Clinic Operating Beyond Ideal Capacity',
                'description' => "Operating at " . round($capacityUtilization) . "% capacity. {$peakHourText}{$waitTimeText}. Consider immediate scheduling adjustments.",
                'actions' => $actions,
                'impact' => 'High - Service quality and patient satisfaction'
            ];
        } elseif ($capacityUtilization < 30) { // Lowered from 50 to 30
            $insights[] = [
                'category' => 'capacity_planning',
                'priority' => 'medium',
                'title' => 'Available Capacity for Growth',
                'description' => "Operating at " . round($capacityUtilization) . "% capacity. Good opportunity to increase patient volume and revenue.",
                'actions' => [
                    'Launch targeted marketing campaigns to fill open appointment slots',
                    'Offer same-day appointment availability to attract walk-ins',
                    'Consider walk-in hours for routine services',
                    'Develop promotional packages for underutilized services',
                    'Evaluate operating hours to better match patient demand patterns'
                ],
                'impact' => 'Medium - Revenue optimization'
            ];
        }

        // Growth trend analysis
        $visitChange = $visitsPrev > 0 ? (($visitsCurr - $visitsPrev) / $visitsPrev) * 100 : 0;
        if ($visitChange > 15) { // Lowered from 25 to 15
            $insights[] = [
                'category' => 'capacity_planning',
                'priority' => 'medium',
                'title' => 'Strong Growth Trend - Plan for Scale',
                'description' => "Patient visits increased by " . round($visitChange) . "% this month. Excellent growth that requires strategic planning.",
                'actions' => [
                    'Begin planning for additional staff to handle increased demand',
                    'Evaluate facility expansion or additional location opportunities',
                    'Assess equipment and supply requirements for higher volume',
                    'Implement scalable operational processes and systems',
                    'Develop comprehensive staff training programs for growth phase'
                ],
                'impact' => 'Medium - Growth sustainability'
            ];
        }

        return $insights;
    }

    /**
     * Get promotion opportunities for services
     */
    public function promotionOpportunities(Request $request)
    {
        $month = $request->query('month') ?? $request->query('period');
        if (!is_string($month) || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            $start = now()->startOfMonth();
        } else {
            try {
                $start = Carbon::createFromFormat('Y-m-d', $month . '-01')->startOfMonth();
            } catch (\Exception $e) {
                $start = now()->startOfMonth();
            }
        }

        $end = (clone $start)->endOfMonth();
        $prevStart = (clone $start)->subMonth()->startOfMonth();
        $prevEnd = (clone $start)->subMonth()->endOfMonth();

        // Get all services that are NOT excluded from analytics (these are eligible for promotion)
        $eligibleServices = DB::table('services')
            ->where('is_active', true)
            ->where(function($query) {
                $query->whereNull('is_excluded_from_analytics')
                      ->orWhere('is_excluded_from_analytics', false);
            })
            ->get();

        $opportunities = [];

        foreach ($eligibleServices as $service) {
            // Get current month performance
            $currentVisits = DB::table('patient_visits')
                ->where('service_id', $service->id)
                ->whereNotNull('start_time')
                ->whereBetween('start_time', [$start, $end])
                ->count();

            // Revenue excludes refunded payments (status = 'refunded')
            $currentRevenue = DB::table('payments as p')
                ->join('patient_visits as v', 'p.patient_visit_id', '=', 'v.id')
                ->where('v.service_id', $service->id)
                ->where('p.status', 'paid')
                ->whereBetween('p.paid_at', [$start, $end])
                ->sum('p.amount_paid');

            // Get previous month performance
            $prevVisits = DB::table('patient_visits')
                ->where('service_id', $service->id)
                ->whereNotNull('start_time')
                ->whereBetween('start_time', [$prevStart, $prevEnd])
                ->count();

            // Revenue excludes refunded payments (status = 'refunded')
            $prevRevenue = DB::table('payments as p')
                ->join('patient_visits as v', 'p.patient_visit_id', '=', 'v.id')
                ->where('v.service_id', $service->id)
                ->where('p.status', 'paid')
                ->whereBetween('p.paid_at', [$prevStart, $prevEnd])
                ->sum('p.amount_paid');

            // Calculate changes
            $visitChange = $prevVisits > 0 ? (($currentVisits - $prevVisits) / $prevVisits) * 100 : ($currentVisits > 0 ? 100 : 0);
            $revenueChange = $prevRevenue > 0 ? (($currentRevenue - $prevRevenue) / $prevRevenue) * 100 : ($currentRevenue > 0 ? 100 : 0);

            // Determine promotion opportunity level
            $opportunityLevel = 'none';
            $reasons = [];

            // High-value services with low utilization
            if ($currentVisits < 5 && $service->price > 2000) {
                $opportunityLevel = 'high';
                $reasons[] = 'High-value service with low utilization';
            }

            // Services with significant decline
            if ($visitChange < -30 && $prevVisits > 5) {
                $opportunityLevel = 'high';
                $reasons[] = 'Significant decline in visits (' . round($visitChange, 1) . '%)';
            }

            // Services with moderate decline
            if ($visitChange < -15 && $prevVisits > 3) {
                $opportunityLevel = 'medium';
                $reasons[] = 'Moderate decline in visits (' . round($visitChange, 1) . '%)';
            }

            // Underperforming services with good margins
            if ($currentVisits < 10 && $service->price > 1000) {
                $opportunityLevel = 'medium';
                $reasons[] = 'Underperforming high-margin service';
            }

            // Services with potential for growth
            if ($currentVisits > 0 && $currentVisits < 20 && $visitChange > 0) {
                $opportunityLevel = 'low';
                $reasons[] = 'Growing service with room for expansion';
            }

            if ($opportunityLevel !== 'none') {
                $opportunities[] = [
                    'service_id' => $service->id,
                    'service_name' => $service->name,
                    'price' => $service->price,
                    'category' => $service->category,
                    'current_visits' => $currentVisits,
                    'prev_visits' => $prevVisits,
                    'visit_change' => round($visitChange, 1),
                    'current_revenue' => round($currentRevenue, 2),
                    'prev_revenue' => round($prevRevenue, 2),
                    'revenue_change' => round($revenueChange, 1),
                    'opportunity_level' => $opportunityLevel,
                    'reasons' => $reasons,
                    'suggested_actions' => $this->getPromotionActions($opportunityLevel, $service, $currentVisits, $visitChange)
                ];
            }
        }

        // Sort by opportunity level and impact
        usort($opportunities, function($a, $b) {
            $priority = ['high' => 3, 'medium' => 2, 'low' => 1];
            if ($priority[$a['opportunity_level']] !== $priority[$b['opportunity_level']]) {
                return $priority[$b['opportunity_level']] - $priority[$a['opportunity_level']];
            }
            return $b['current_revenue'] - $a['current_revenue'];
        });

        return response()->json([
            'month' => $start->format('Y-m'),
            'opportunities' => $opportunities,
            'summary' => [
                'total_eligible_services' => $eligibleServices->count(),
                'high_priority_opportunities' => count(array_filter($opportunities, fn($o) => $o['opportunity_level'] === 'high')),
                'medium_priority_opportunities' => count(array_filter($opportunities, fn($o) => $o['opportunity_level'] === 'medium')),
                'low_priority_opportunities' => count(array_filter($opportunities, fn($o) => $o['opportunity_level'] === 'low')),
            ]
        ]);
    }

    /**
     * Get suggested promotion actions based on service characteristics
     */
    private function getPromotionActions($opportunityLevel, $service, $currentVisits, $visitChange)
    {
        $actions = [];

        if ($opportunityLevel === 'high') {
            $actions = [
                'Create targeted promotional campaign with 20-30% discount',
                'Implement referral incentives for this service',
                'Train staff on cross-selling and upselling techniques',
                'Consider bundling with popular services',
                'Review pricing strategy and competitive positioning',
                'Develop patient education materials about service benefits'
            ];
        } elseif ($opportunityLevel === 'medium') {
            $actions = [
                'Offer limited-time promotional pricing (10-20% discount)',
                'Create service packages or bundles',
                'Implement staff training on service benefits',
                'Consider seasonal promotion timing',
                'Review service delivery process for improvements'
            ];
        } else {
            $actions = [
                'Maintain current marketing efforts',
                'Consider gradual price optimization',
                'Monitor performance trends closely',
                'Explore cross-selling opportunities'
            ];
        }

        // Add specific actions based on service characteristics
        if ($service->price > 5000) {
            $actions[] = 'Consider payment plan options to reduce barrier to entry';
        }

        if ($currentVisits === 0) {
            $actions[] = 'Launch awareness campaign to introduce service to existing patients';
        }

        if ($visitChange < -20) {
            $actions[] = 'Conduct patient feedback survey to identify issues';
        }

        return $actions;
    }

    /**
     * Get peak hours with visit counts for specific scheduling recommendations
     */
    private function getPeakHours($start, $end)
    {
        $results = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$start, $end])
            ->selectRaw('HOUR(v.start_time) as hour, COUNT(*) as count')
            ->groupBy('hour')
            ->orderByDesc('count')
            ->limit(3)
            ->get();
            
        return $results->map(function($item) {
            return [
                'hour' => (int) $item->hour,
                'count' => (int) $item->count
            ];
        })->toArray();
    }

    /**
     * Calculate average wait time between scheduled and actual start times
     */
    private function calculateAverageWaitTime($start, $end)
    {
        // This is a simplified calculation - in a real system you'd have appointment scheduled times
        // For now, we'll estimate based on visit patterns
        $visits = DB::table('patient_visits as v')
            ->whereNotNull('v.start_time')
            ->whereBetween('v.start_time', [$start, $end])
            ->selectRaw('DATE(v.start_time) as date, HOUR(v.start_time) as hour, COUNT(*) as count')
            ->groupBy('date', 'hour')
            ->get();

        $totalWaitTime = 0;
        $totalVisits = 0;

        foreach ($visits as $visit) {
            // Estimate wait time based on visit density
            if ($visit->count > 3) {
                $totalWaitTime += ($visit->count - 1) * 15; // 15 min wait per additional patient
                $totalVisits += $visit->count;
            }
        }

        return $totalVisits > 0 ? round($totalWaitTime / $totalVisits) : 0;
    }

    /**
     * Identify service bottlenecks that cause delays
     */
    private function identifyServiceBottlenecks($start, $end)
    {
        $results = DB::table('patient_visits as v')
            ->leftJoin('services as s', 's.id', '=', 'v.service_id')
            ->whereNotNull('v.start_time')
            ->whereNotNull('v.end_time')
            ->whereBetween('v.start_time', [$start, $end])
            ->selectRaw('v.service_id, COALESCE(s.name, "(Unspecified)") as service_name, 
                        COUNT(*) as visit_count,
                        AVG(TIMESTAMPDIFF(MINUTE, v.start_time, v.end_time)) as avg_duration')
            ->groupBy('v.service_id', 's.name')
            ->having('avg_duration', '>', 60) // Services taking more than 60 minutes on average
            ->having('visit_count', '>', 5) // With significant volume
            ->orderByDesc('avg_duration')
            ->limit(3)
            ->get();
            
        return $results->map(function($item) {
            return [
                'service_id' => (int) $item->service_id,
                'service_name' => $item->service_name,
                'visit_count' => (int) $item->visit_count,
                'avg_duration' => round((float) $item->avg_duration, 1)
            ];
        })->toArray();
    }

    /**
     * Get services with significant revenue decline
     */
    private function getDecliningServices($start, $end, $prevStart, $prevEnd)
    {
        // Revenue excludes refunded payments (status = 'refunded')
        $currentRevenue = DB::table('payments as p')
            ->join('patient_visits as v', 'p.patient_visit_id', '=', 'v.id')
            ->leftJoin('services as s', 's.id', '=', 'v.service_id')
            ->where('p.status', 'paid')
            ->whereBetween('p.paid_at', [$start, $end])
            ->where(function($query) {
                $query->whereNull('s.is_excluded_from_analytics')
                      ->orWhere('s.is_excluded_from_analytics', false);
            })
            ->selectRaw('v.service_id, COALESCE(s.name, "(Unspecified)") as service_name, SUM(p.amount_paid) as revenue')
            ->groupBy('v.service_id', 's.name')
            ->get()
            ->keyBy('service_id');

        $prevRevenue = DB::table('payments as p')
            ->join('patient_visits as v', 'p.patient_visit_id', '=', 'v.id')
            ->where('p.status', 'paid')
            ->whereBetween('p.paid_at', [$prevStart, $prevEnd])
            ->selectRaw('v.service_id, SUM(p.amount_paid) as revenue')
            ->groupBy('v.service_id')
            ->pluck('revenue', 'service_id');

        $declining = [];
        foreach ($currentRevenue as $service) {
            $prev = $prevRevenue[$service->service_id] ?? 0;
            if ($prev > 0) {
                $change = (($service->revenue - $prev) / $prev) * 100;
                if ($change < -20) { // 20% or more decline
                    $declining[] = [
                        'service_id' => $service->service_id,
                        'service_name' => $service->service_name,
                        'current_revenue' => $service->revenue,
                        'prev_revenue' => $prev,
                        'revenue_change' => round($change, 1)
                    ];
                }
            }
        }

        usort($declining, fn($a, $b) => $a['revenue_change'] <=> $b['revenue_change']);
        return $declining;
    }

    /**
     * Get high-value services with low performance
     */
    private function getLowPerformingHighValueServices($start, $end)
    {
        $results = DB::table('services as s')
            ->leftJoin('patient_visits as v', function($join) use ($start, $end) {
                $join->on('s.id', '=', 'v.service_id')
                     ->whereNotNull('v.start_time')
                     ->whereBetween('v.start_time', [$start, $end]);
            })
            ->where('s.is_active', true)
            ->where('s.price', '>', 2000) // High value services
            ->where(function($query) {
                $query->whereNull('s.is_excluded_from_analytics')
                      ->orWhere('s.is_excluded_from_analytics', false);
            })
            ->selectRaw('s.id, s.name, s.price, COUNT(v.id) as visits')
            ->groupBy('s.id', 's.name', 's.price')
            ->having('visits', '<', 5) // Low performance
            ->orderByDesc('s.price')
            ->limit(5)
            ->get();
            
        return $results->map(function($item) {
            return [
                'id' => (int) $item->id,
                'name' => $item->name,
                'price' => (float) $item->price,
                'visits' => (int) $item->visits
            ];
        })->toArray();
    }

    /**
     * Get detailed retention data for specific actions
     */
    private function getDetailedRetentionData($start, $end)
    {
        // This would contain more detailed retention analysis
        // For now, return basic structure
        return [
            'total_patients' => 0,
            'returned_patients' => 0,
            'lost_patients' => 0
        ];
    }

    /**
     * Get count of lost patients for targeted re-engagement
     */
    private function getLostPatients($start, $end)
    {
        // Get patients who had their last visit 3+ months ago
        $threeMonthsAgo = (clone $start)->subMonths(3);
        
        $lostPatients = DB::table('patient_visits as v')
            ->selectRaw('COUNT(DISTINCT v.patient_id) as count')
            ->whereNotNull('v.start_time')
            ->where('v.start_time', '<', $threeMonthsAgo)
            ->whereNotExists(function($query) use ($threeMonthsAgo) {
                $query->select(DB::raw(1))
                      ->from('patient_visits as v2')
                      ->whereColumn('v2.patient_id', 'v.patient_id')
                      ->where('v2.start_time', '>=', $threeMonthsAgo);
            })
            ->value('count');

        return ['count' => $lostPatients ?? 0];
    }

    /**
     * Get no-show patterns by day of week
     */
    private function getNoShowPatterns($start, $end)
    {
        $results = DB::table('appointments')
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->selectRaw('DAYNAME(date) as day_of_week, 
                        COUNT(*) as total_appointments,
                        SUM(CASE WHEN status = "no_show" THEN 1 ELSE 0 END) as no_shows,
                        ROUND((SUM(CASE WHEN status = "no_show" THEN 1 ELSE 0 END) / COUNT(*)) * 100, 1) as no_show_rate')
            ->groupBy('day_of_week')
            ->having('no_show_rate', '>', 10)
            ->orderByDesc('no_show_rate')
            ->get();
            
        return $results->map(function($item) {
            return [
                'day_of_week' => $item->day_of_week,
                'total_appointments' => (int) $item->total_appointments,
                'no_shows' => (int) $item->no_shows,
                'no_show_rate' => (float) $item->no_show_rate
            ];
        })->toArray();
    }

    /**
     * Calculate revenue loss from no-shows
     */
    private function calculateNoShowRevenueLoss($start, $end)
    {
        return DB::table('appointments as a')
            ->join('services as s', 'a.service_id', '=', 's.id')
            ->where('a.status', 'no_show')
            ->whereBetween('a.date', [$start->toDateString(), $end->toDateString()])
            ->sum('s.price');
    }

    /**
     * Test insights endpoint to verify insights generation
     */
    public function testInsights()
    {
        $insights = [
            [
                'category' => 'system_test',
                'priority' => 'low',
                'title' => 'Test Insight Working',
                'description' => 'This is a test insight to verify the system is working.',
                'actions' => ['Test action 1', 'Test action 2'],
                'impact' => 'Low - System verification'
            ],
            [
                'category' => 'marketing_opportunities',
                'priority' => 'medium',
                'title' => 'Test Promotion Suggestion',
                'description' => 'This is a test promotion suggestion to verify promotion insights are working.',
                'actions' => [
                    'Create promotional campaign for underperforming services',
                    'Offer 15% discount on low-utilization services',
                    'Launch awareness campaign for high-value services'
                ],
                'impact' => 'Medium - Revenue growth potential'
            ]
        ];

        return response()->json([
            'test' => true,
            'insights' => $insights,
            'count' => count($insights)
        ]);
    }

    /**
     * Check for clinic closures based on weekly schedule vs actual visits
     */
    private function checkClinicClosures($start, $end)
    {
        try {
            // Get the weekly schedule defaults
            $weeklySchedule = DB::table('clinic_weekly_schedules')
                ->orderBy('weekday')
                ->get()
                ->keyBy('weekday');

            // Get all dates in the month
            $current = $start->copy();
            $closedDays = [];
            $totalExpectedOpenDays = 0;
            $totalActualOpenDays = 0;

            while ($current->lte($end)) {
                $weekday = $current->dayOfWeek; // 0 = Sunday, 6 = Saturday
                $dateStr = $current->toDateString();
                
                // Check if clinic should be open based on weekly schedule
                $shouldBeOpen = isset($weeklySchedule[$weekday]) && $weeklySchedule[$weekday]->is_open;
                
                if ($shouldBeOpen) {
                    $totalExpectedOpenDays++;
                    
                    // Check if there were any visits on this day
                    $hasVisits = DB::table('patient_visits')
                        ->whereNotNull('start_time')
                        ->whereDate('start_time', $dateStr)
                        ->exists();
                    
                    if ($hasVisits) {
                        $totalActualOpenDays++;
                    } else {
                        // Check if there's a calendar override for this day
                        $calendarOverride = DB::table('clinic_calendar')
                            ->where('date', $dateStr)
                            ->first();
                        
                        // If no calendar override saying it should be closed, consider it an unexpected closure
                        if (!$calendarOverride || $calendarOverride->is_open) {
                            $closedDays[] = [
                                'date' => $dateStr,
                                'day_name' => $current->format('l'),
                                'reason' => 'No visits recorded despite being scheduled to be open'
                            ];
                        }
                    }
                }
                
                $current->addDay();
            }

            $closureCount = count($closedDays);
            $closureRate = $totalExpectedOpenDays > 0 ? ($closureCount / $totalExpectedOpenDays) * 100 : 0;

            return [
                'total_expected_open_days' => $totalExpectedOpenDays,
                'total_actual_open_days' => $totalActualOpenDays,
                'unexpected_closures' => $closedDays,
                'closure_count' => $closureCount,
                'closure_rate_percentage' => round($closureRate, 2),
                'has_significant_closures' => $closureCount >= 5, // 5 or more days considered significant
                'summary' => $closureCount >= 5 
                    ? "Clinic was closed for {$closureCount} days when it should have been open based on weekly schedule. This may indicate operational issues or unexpected closures."
                    : ($closureCount > 0 
                        ? "Clinic was closed for {$closureCount} day(s) when it should have been open. Monitor for patterns."
                        : "All scheduled operating days had activity recorded.")
            ];

        } catch (\Exception $e) {
            Log::error('Error checking clinic closures: ' . $e->getMessage());
            return [
                'error' => 'Unable to check clinic closure status',
                'total_expected_open_days' => 0,
                'total_actual_open_days' => 0,
                'unexpected_closures' => [],
                'closure_count' => 0,
                'closure_rate_percentage' => 0,
                'has_significant_closures' => false,
                'summary' => 'Unable to determine clinic closure status'
            ];
        }
    }
}