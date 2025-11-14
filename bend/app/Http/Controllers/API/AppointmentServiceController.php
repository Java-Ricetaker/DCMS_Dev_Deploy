<?php

namespace App\Http\Controllers\API;

use Carbon\Carbon;
use App\Models\Service;
use Illuminate\Http\Request;
use App\Models\ClinicCalendar;
use App\Models\ServiceDiscount;
use App\Http\Controllers\Controller;
use App\Models\ClinicWeeklySchedule;
use App\Models\Patient;
use App\Services\PreferredDentistService;
use App\Services\ClinicDateResolverService;
use Illuminate\Support\Facades\Auth;
use App\Models\PatientVisit;

class AppointmentServiceController extends Controller
{
    public function availableServices(Request $request)
    {
        $date = $request->query('date');
        if (!$date || !Carbon::hasFormat($date, 'Y-m-d')) {
            return response()->json(['message' => 'Invalid or missing date.'], 422);
        }

        $carbonDate = Carbon::parse($date);
        $dayOfWeek = $carbonDate->dayOfWeek; // 0 = Sunday, 6 = Saturday

        // 1. Check if clinic is open on that date
        $override = ClinicCalendar::where('date', $date)->first();
        $isOpen = false;

        if ($override) {
            $isOpen = $override->is_open;
        } else {
            $weekly = ClinicWeeklySchedule::where('weekday', $dayOfWeek)->first();
            $isOpen = $weekly && $weekly->is_open;
        }

        if (!$isOpen) {
            return response()->json([
                'message' => 'Clinic is closed on the selected date.',
                'services' => []
            ]);
        }

        // 2. Promo logic: get launched promos and deduplicate
        $activePromos = ServiceDiscount::with(['service.followUpParent'])
            ->where('status', 'launched')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->get();

        $promoServiceIds = $activePromos->pluck('service_id')->toArray();

        $latestPromos = $activePromos
            ->groupBy('service_id')
            ->map(function ($group) {
                return $group->sortByDesc('start_date')->first();
            });

        $promoServices = $latestPromos->map(function ($promo) {
            $originalPrice = $promo->service->price;
            $discountPrice = $promo->discounted_price;
            $percent = $originalPrice > 0
                ? min(round(100 - ($discountPrice / $originalPrice * 100)), 100)
                : 100;

            $service = $promo->service->load('followUpChildren');

            return [
                'id' => $service->id,
                'name' => $service->name,
                'type' => 'promo',
                'original_price' => $originalPrice,
                'promo_price' => $discountPrice,
                'discount_percent' => $percent,
                'per_teeth_service' => $service->per_teeth_service,
                'per_tooth_minutes' => $service->per_tooth_minutes,
                'is_follow_up' => (bool) $service->is_follow_up,
                'follow_up_parent_service_id' => $service->follow_up_parent_service_id,
                'follow_up_parent_name' => optional($service->followUpParent)->name,
                'follow_up_max_gap_weeks' => $service->follow_up_max_gap_weeks,
                'has_follow_up_services' => $service->followUpChildren->isNotEmpty(),
                'follow_up_services' => $service->followUpChildren->map(function ($followUp) {
                    return [
                        'id' => $followUp->id,
                        'name' => $followUp->name,
                    ];
                })->values(),
            ];
        })->values();

        // 3. Regular services (exclude those with promo)
        $regularServices = Service::where('is_special', false)
            ->whereNotIn('id', $promoServiceIds)
            ->with(['followUpParent', 'followUpChildren'])
            ->get()
            ->map(function ($service) {
                return [
                    'id' => $service->id,
                    'name' => $service->name,
                    'type' => 'regular',
                    'price' => $service->price,
                    'per_teeth_service' => $service->per_teeth_service,
                    'per_tooth_minutes' => $service->per_tooth_minutes,
                    'is_follow_up' => (bool) $service->is_follow_up,
                    'follow_up_parent_service_id' => $service->follow_up_parent_service_id,
                    'follow_up_parent_name' => optional($service->followUpParent)->name,
                    'follow_up_max_gap_weeks' => $service->follow_up_max_gap_weeks,
                    'has_follow_up_services' => $service->followUpChildren->isNotEmpty(),
                    'follow_up_services' => $service->followUpChildren->map(function ($followUp) {
                        return [
                            'id' => $followUp->id,
                            'name' => $followUp->name,
                        ];
                    })->values(),
                ];
            });

        // 4. Special services (permanent or date-limited)
        $specialServices = Service::where('is_special', true)
            ->with(['followUpParent', 'followUpChildren'])
            ->get()->filter(function ($service) use ($carbonDate) {
            if (!$service->special_start_date && !$service->special_end_date) {
                return true;
            }

            return $service->special_start_date &&
                $service->special_end_date &&
                $carbonDate->between($service->special_start_date, $service->special_end_date);
        })->map(function ($service) {
            return [
                'id' => $service->id,
                'name' => $service->name,
                'type' => 'special',
                'price' => $service->price,
                'special_until' => optional($service->special_end_date)?->toDateString(),
                'per_teeth_service' => $service->per_teeth_service,
                'per_tooth_minutes' => $service->per_tooth_minutes,
                'is_follow_up' => (bool) $service->is_follow_up,
                'follow_up_parent_service_id' => $service->follow_up_parent_service_id,
                'follow_up_parent_name' => optional($service->followUpParent)->name,
                'follow_up_max_gap_weeks' => $service->follow_up_max_gap_weeks,
                'has_follow_up_services' => $service->followUpChildren->isNotEmpty(),
                'follow_up_services' => $service->followUpChildren->map(function ($followUp) {
                    return [
                        'id' => $followUp->id,
                        'name' => $followUp->name,
                    ];
                })->values(),
            ];
        });

        $effectivePatientId = null;
        if ($request->filled('patient_id')) {
            $effectivePatientId = (int) $request->query('patient_id');
        } elseif (Auth::check()) {
            $effectivePatientId = optional(Patient::byUser(Auth::id()))?->id;
        }

        // 5. Combine all results
        $combined = $regularServices
            ->concat($specialServices)
            ->concat($promoServices)
            ->values();

        $shouldRestrictFollowUps = $this->shouldRestrictFollowUps();
        $eligibleFollowUpServiceIds = [];

        if ($shouldRestrictFollowUps) {
            $eligibleFollowUpServiceIds = $this->resolveEligibleFollowUpServiceIds(
                $combined,
                $effectivePatientId,
                $carbonDate
            );
        }

        $combined = $combined->filter(function ($service) use (
            $shouldRestrictFollowUps,
            $eligibleFollowUpServiceIds,
            $effectivePatientId
        ) {
            if (!($service['is_follow_up'] ?? false)) {
                return true;
            }

            if (!$shouldRestrictFollowUps) {
                return true;
            }

            if (!$effectivePatientId) {
                return false;
            }

            return in_array($service['id'], $eligibleFollowUpServiceIds, true);
        })->values();

        $includeMeta = $request->boolean('with_meta', false);

        if (!$includeMeta) {
            return response()->json($combined);
        }

        $patient = $effectivePatientId ? Patient::find($effectivePatientId) : null;
        $preferredDentistData = null;
        $preferredDentistPresent = false;
        $highlightDates = [];

        if ($patient) {
            /** @var PreferredDentistService $preferredDentistService */
            $preferredDentistService = app(PreferredDentistService::class);
            $preferredDentist = $preferredDentistService->resolveForPatient($patient->id, $carbonDate);

            if ($preferredDentist) {
                $preferredDentistData = [
                    'id' => $preferredDentist->id,
                    'code' => $preferredDentist->dentist_code,
                    'name' => $preferredDentist->dentist_name,
                ];

                /** @var ClinicDateResolverService $dateResolver */
                $dateResolver = app(ClinicDateResolverService::class);
                $currentSnap = $dateResolver->resolve($carbonDate);
                $preferredDentistPresent = in_array(
                    $preferredDentist->id,
                    $currentSnap['active_dentist_ids'] ?? [],
                    true
                );

                $windowStart = now()->addDay()->startOfDay();
                $windowEnd = $windowStart->copy()->addDays(6);
                $cursor = $windowStart->copy();

                while ($cursor->lte($windowEnd)) {
                    $snap = $dateResolver->resolve($cursor);
                    $isPresent = in_array(
                        $preferredDentist->id,
                        $snap['active_dentist_ids'] ?? [],
                        true
                    );
                    if ($isPresent) {
                        $highlightDates[] = $cursor->toDateString();
                    }
                    $cursor->addDay();
                }
            }
        }

        return response()->json([
            'services' => $combined,
            'metadata' => [
                'preferred_dentist' => $preferredDentistData,
                'preferred_dentist_present' => $preferredDentistPresent,
                'highlight_dates' => $highlightDates,
            ],
        ]);
    }

    private function shouldRestrictFollowUps(): bool
    {
        if (!Auth::check()) {
            return false;
        }

        return Auth::user()->role === 'patient';
    }

    /**
     * @param \Illuminate\Support\Collection<int, array<string, mixed>> $services
     * @return array<int, int>
     */
    private function resolveEligibleFollowUpServiceIds($services, ?int $patientId, Carbon $targetDate): array
    {
        if (!$patientId) {
            return [];
        }

        $followUpServices = $services->filter(function ($service) {
            return ($service['is_follow_up'] ?? false) && !empty($service['follow_up_parent_service_id']);
        });

        if ($followUpServices->isEmpty()) {
            return [];
        }

        $parentServiceIds = $followUpServices
            ->pluck('follow_up_parent_service_id')
            ->filter()
            ->unique()
            ->values();

        $followUpServiceIds = $followUpServices
            ->pluck('id')
            ->filter()
            ->unique()
            ->values();

        $allRelevantServiceIds = $parentServiceIds
            ->merge($followUpServiceIds)
            ->unique()
            ->values();

        if ($allRelevantServiceIds->isEmpty()) {
            return [];
        }

        $recentVisits = PatientVisit::where('patient_id', $patientId)
            ->where('status', 'completed')
            ->whereIn('service_id', $allRelevantServiceIds->all())
            ->whereNotNull('visit_date')
            ->orderBy('visit_date', 'desc')
            ->get()
            ->groupBy('service_id');

        $eligible = [];

        foreach ($followUpServices as $service) {
            $parentId = $service['follow_up_parent_service_id'];
            if (!$parentId) {
                continue;
            }

            /** @var \Illuminate\Support\Collection|null $visitGroup */
            $parentVisitGroup = $recentVisits->get($parentId);
            $latestParentVisit = $parentVisitGroup?->first();

            /** @var \Illuminate\Support\Collection|null $followUpVisitGroup */
            $followUpVisitGroup = $recentVisits->get($service['id']);
            $latestFollowUpVisit = $followUpVisitGroup?->first();

            $lastRelevantDate = null;

            if ($latestParentVisit && $latestParentVisit->visit_date) {
                $lastRelevantDate = $latestParentVisit->visit_date->copy();
            }

            if ($latestFollowUpVisit && $latestFollowUpVisit->visit_date) {
                $followUpDate = $latestFollowUpVisit->visit_date->copy();
                if ($lastRelevantDate === null || $followUpDate->gt($lastRelevantDate)) {
                    $lastRelevantDate = $followUpDate;
                }
            }

            if ($lastRelevantDate === null) {
                continue;
            }

            $maxGapWeeks = $service['follow_up_max_gap_weeks'] ?? null;

            if ($maxGapWeeks !== null) {
                $deadline = $lastRelevantDate->copy()->addWeeks((int) $maxGapWeeks);
                if ($targetDate->gt($deadline)) {
                    continue;
                }
            }

            if ($targetDate->lt($lastRelevantDate)) {
                continue;
            }

            $eligible[] = $service['id'];
        }

        return $eligible;
    }
}
