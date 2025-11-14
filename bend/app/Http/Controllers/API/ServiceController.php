<?php

namespace App\Http\Controllers\API;

use App\Models\Service;
use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use App\Services\SystemLogService;

class ServiceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        return response()->json(Service::with([
            'bundledServices',
            'bundleItems',
            'category',
            'followUpParent',
        ])->get());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'price' => 'required|numeric|min:0',
            'service_category_id' => 'required|exists:service_categories,id',
            'is_excluded_from_analytics' => 'boolean',
            'is_special' => 'boolean',
            'special_start_date' => 'nullable|date',
            'special_end_date' => 'nullable|date|after_or_equal:special_start_date',
            'estimated_minutes' => 'required|integer|min:1',
            'bundled_service_ids' => 'array',
            'bundled_service_ids.*' => 'exists:services,id',
            'is_follow_up' => 'boolean',
            'follow_up_parent_service_id' => [
                'nullable',
                'integer',
                'exists:services,id',
            ],
            'follow_up_max_gap_weeks' => 'nullable|integer|min:0',
        ]);

        // Round up estimated time to nearest 30 mins
        $validated['estimated_minutes'] = ceil($validated['estimated_minutes'] / 30) * 30;

        if (($validated['is_follow_up'] ?? false) && empty($validated['follow_up_parent_service_id'])) {
            return response()->json([
                'message' => 'Follow-up services require selecting a parent service.',
                'errors' => [
                    'follow_up_parent_service_id' => ['Follow-up services require selecting a parent service.'],
                ],
            ], 422);
        }

        if (!($validated['is_follow_up'] ?? false)) {
            $validated['follow_up_parent_service_id'] = null;
            $validated['follow_up_max_gap_weeks'] = null;
        }

        $service = Service::create($validated);

        // Sync bundled services (if any)
        if ($request->has('bundled_service_ids')) {
            $service->bundledServices()->sync($request->input('bundled_service_ids'));
        }

        // Log service creation
        SystemLogService::logService(
            'created',
            $service->id,
            "New service created: {$service->name}",
            [
                'service_id' => $service->id,
                'name' => $service->name,
                'price' => $service->price,
                'estimated_minutes' => $service->estimated_minutes,
                'category_id' => $service->service_category_id,
                'created_by' => auth()->id()
            ]
        );

        return response()->json($service->load(['bundledServices', 'bundleItems', 'category', 'followUpParent']), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        return response()->json(Service::with(['bundledServices', 'bundleItems', 'category', 'followUpParent'])->findOrFail($id));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        $service = Service::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'price' => 'sometimes|required|numeric|min:0',
            'service_category_id' => 'nullable|exists:service_categories,id',
            'is_excluded_from_analytics' => 'boolean',
            'is_special' => 'boolean',
            'special_start_date' => 'nullable|date',
            'special_end_date' => 'nullable|date|after_or_equal:special_start_date',
            'estimated_minutes' => 'sometimes|required|integer|min:1',
            'bundled_service_ids' => 'array',
            'bundled_service_ids.*' => 'exists:services,id',
            'is_follow_up' => 'boolean',
            'follow_up_parent_service_id' => [
                'nullable',
                'integer',
                'exists:services,id',
            ],
            'follow_up_max_gap_weeks' => 'nullable|integer|min:0',
        ]);

        if (isset($validated['estimated_minutes'])) {
            $validated['estimated_minutes'] = ceil($validated['estimated_minutes'] / 30) * 30;
        }

        $oldData = [
            'name' => $service->name,
            'price' => $service->price,
            'estimated_minutes' => $service->estimated_minutes
        ];

        $shouldBeFollowUp = $validated['is_follow_up'] ?? $service->is_follow_up;
        $parentServiceId = $validated['follow_up_parent_service_id'] ?? $service->follow_up_parent_service_id;

        if ($shouldBeFollowUp && !$parentServiceId) {
            return response()->json([
                'message' => 'Follow-up services require selecting a parent service.',
                'errors' => [
                    'follow_up_parent_service_id' => ['Follow-up services require selecting a parent service.'],
                ],
            ], 422);
        }

        if (array_key_exists('is_follow_up', $validated) && !$validated['is_follow_up']) {
            $validated['follow_up_parent_service_id'] = null;
            $validated['follow_up_max_gap_weeks'] = null;
        }

        if (
            $shouldBeFollowUp === true &&
            $parentServiceId === $service->id
        ) {
            return response()->json([
                'message' => 'A follow-up service must reference a different parent service.',
                'errors' => [
                    'follow_up_parent_service_id' => ['A follow-up service must reference a different parent service.'],
                ],
            ], 422);
        }

        $service->update($validated);

        // Sync bundled services
        if ($request->has('bundled_service_ids')) {
            $service->bundledServices()->sync($request->input('bundled_service_ids'));
        }

        // Log service update
        SystemLogService::logService(
            'updated',
            $service->id,
            "Service updated: {$service->name}",
            [
                'service_id' => $service->id,
                'name' => $service->name,
                'old_values' => $oldData,
                'new_values' => [
                    'name' => $service->name,
                    'price' => $service->price,
                    'estimated_minutes' => $service->estimated_minutes
                ],
                'updated_by' => auth()->id()
            ]
        );

        return response()->json($service->load(['bundledServices', 'bundleItems', 'category', 'followUpParent']));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        $service = Service::findOrFail($id);
        $serviceName = $service->name;

        $service->delete();

        // Log service deletion
        SystemLogService::logService(
            'deleted',
            $id,
            "Service deleted: {$serviceName}",
            [
                'service_id' => $id,
                'name' => $serviceName,
                'deleted_by' => auth()->id()
            ]
        );

        return response()->json(null, 204);
    }

    /**
     * Public endpoint for landing page - returns active services with current promos
     */
    public function publicIndex()
    {
        $services = Service::where('is_active', true)
            ->with(['bundledServices', 'bundleItems', 'category', 'discounts' => function($query) {
                $query->whereIn('status', ['planned', 'launched'])
                      ->orderBy('start_date');
            }])
            ->get()
            ->map(function($service) {
                // Clean up the service data for public display
                $serviceData = $service->toArray();
                
                // Remove internal fields that might cause rendering issues
                unset($serviceData['is_excluded_from_analytics']);
                
                // Clean up discounts data
                if (isset($serviceData['discounts'])) {
                    $serviceData['discounts'] = collect($serviceData['discounts'])->map(function($discount) {
                        return [
                            'id' => $discount['id'],
                            'service_id' => $discount['service_id'],
                            'start_date' => $discount['start_date'],
                            'end_date' => $discount['end_date'],
                            'discounted_price' => $discount['discounted_price'],
                            'status' => $discount['status'],
                            'created_at' => $discount['created_at'],
                            'updated_at' => $discount['updated_at']
                        ];
                    })->toArray();
                }
                
                return $serviceData;
            });

        return response()->json($services);
    }
}
