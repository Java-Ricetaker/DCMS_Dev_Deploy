<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt - {{ $receipt_number }}</title>
    <style>
        body {
            font-family: 'DejaVu Sans', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
            font-size: 12px;
        }
        .header {
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 3px solid #0077be;
            padding-bottom: 15px;
            margin-bottom: 25px;
            gap: 12px;
        }
        .header-logo {
            width: 40px;
            height: 40px;
            object-fit: contain;
        }
        .header-content {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        .header h1 {
            color: #3c3c3c;
            margin: 0;
            font-size: 20px;
            font-weight: bold;
        }
        .header p {
            color: #666;
            margin: 5px 0 0 0;
            font-size: 14px;
        }
        .receipt-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
        }
        .receipt-details, .clinic-details {
            width: 48%;
        }
        .section-title {
            font-size: 14px;
            font-weight: bold;
            color: #0077be;
            margin-bottom: 10px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            padding: 3px 0;
        }
        .info-label {
            font-weight: bold;
            color: #555;
        }
        .info-value {
            color: #333;
        }
        .patient-section {
            margin-bottom: 25px;
        }
        .service-section {
            margin-bottom: 25px;
        }
        .service-details {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #0077be;
        }
        .payment-section {
            margin-bottom: 25px;
        }
        .payment-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        .payment-table th,
        .payment-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        .payment-table th {
            background-color: #f8f9fa;
            font-weight: bold;
            color: #0077be;
        }
        .total-row {
            background-color: #e3f2fd;
            font-weight: bold;
        }
        .amount {
            font-size: 16px;
            font-weight: bold;
            color: #28a745;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 10px;
        }
        .notes-section {
            margin-top: 20px;
            padding: 10px;
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 5px;
        }
        .notes-section h4 {
            margin: 0 0 10px 0;
            color: #856404;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="{{ base_path('public/logo.png') }}" alt="Kreative Dental Logo" class="header-logo" />
        <div class="header-content">
            <h1>{{ $clinic_name }}</h1>
            <p>Official Receipt</p>
        </div>
    </div>
    
    <div class="receipt-info">
        <div class="receipt-details">
            <div class="section-title">Receipt Information</div>
            <div class="info-row">
                <span class="info-label">Receipt No:</span>
                <span class="info-value">{{ $receipt_number }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Date:</span>
                <span class="info-value">{{ $receipt_date }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Time:</span>
                <span class="info-value">{{ $receipt_time }}</span>
            </div>
        </div>
        
        <div class="clinic-details">
            <div class="section-title">Clinic Information</div>
            <div class="info-row">
                <span class="info-label">Address:</span>
                <span class="info-value">{{ $clinic_address }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Phone:</span>
                <span class="info-value">{{ $clinic_phone }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Email:</span>
                <span class="info-value">{{ $clinic_email }}</span>
            </div>
        </div>
    </div>
    
    <div class="patient-section">
        <div class="section-title">Patient Information</div>
        <div class="info-row">
            <span class="info-label">Name:</span>
            <span class="info-value">{{ $patient_name }}</span>
        </div>
        @if($patient_email)
        <div class="info-row">
            <span class="info-label">Email:</span>
            <span class="info-value">{{ $patient_email }}</span>
        </div>
        @endif
        @if($patient_phone)
        <div class="info-row">
            <span class="info-label">Phone:</span>
            <span class="info-value">{{ $patient_phone }}</span>
        </div>
        @endif
        @if($patient_address)
        <div class="info-row">
            <span class="info-label">Address:</span>
            <span class="info-value">{{ $patient_address }}</span>
        </div>
        @endif
    </div>
    
    <div class="service-section">
        <div class="section-title">Service Details</div>
        <div class="service-details">
            <div class="info-row">
                <span class="info-label">Service:</span>
                <span class="info-value">{{ $service_name }}</span>
            </div>
            @if($service_description)
            <div class="info-row">
                <span class="info-label">Description:</span>
                <span class="info-value">{{ $service_description }}</span>
            </div>
            @endif
            <div class="info-row">
                <span class="info-label">Appointment Date:</span>
                <span class="info-value">{{ $service_date }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Time Slot:</span>
                <span class="info-value">{{ $service_time }}</span>
            </div>
            @if($teeth_count)
            <div class="info-row">
                <span class="info-label">Teeth Count:</span>
                <span class="info-value">{{ $teeth_description }}</span>
            </div>
            @endif
            <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">{{ $appointment_status }}</span>
            </div>
        </div>
    </div>
    
    <div class="payment-section">
        <div class="section-title">Payment Information</div>
        <table class="payment-table">
            <thead>
                <tr>
                    <th>Payment Method</th>
                    <th>Reference</th>
                    <th>Amount</th>
                    <th>Date Paid</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                @forelse($payment_details as $payment)
                <tr>
                    <td>{{ $payment['method'] }}</td>
                    <td>{{ $payment['reference'] }}</td>
                    <td>₱{{ number_format($payment['amount'], 2) }}</td>
                    <td>{{ $payment['paid_at'] ?? 'N/A' }}</td>
                    <td>{{ ucfirst($payment['status']) }}</td>
                </tr>
                @empty
                <tr>
                    <td colspan="5" style="text-align: center;">No payment records found</td>
                </tr>
                @endforelse
                <tr class="total-row">
                    <td colspan="2"><strong>Total Amount</strong></td>
                    <td class="amount">₱{{ number_format($total_amount, 2) }}</td>
                    <td colspan="2"></td>
                </tr>
                <tr class="total-row">
                    <td colspan="2"><strong>Total Paid</strong></td>
                    <td class="amount">₱{{ number_format($total_paid, 2) }}</td>
                    <td colspan="2"></td>
                </tr>
            </tbody>
        </table>
    </div>
    
    @if($refund_request && $refund_request['status'] !== 'rejected')
    <div class="payment-section" style="margin-top: 25px;">
        <div class="section-title" style="color: #dc3545;">Refund Information</div>
        <table class="payment-table">
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Status</th>
                    @if($refund_request['processed_at'])
                    <th>Processed Date</th>
                    @endif
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Original Payment Amount</td>
                    <td>₱{{ number_format($refund_request['original_amount'], 2) }}</td>
                    <td rowspan="{{ $refund_request['cancellation_fee'] > 0 ? 3 : 2 }}">
                        <span style="
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-weight: bold;
                            font-size: 11px;
                            background-color: {{ $refund_request['status'] === 'processed' ? '#d4edda' : ($refund_request['status'] === 'approved' ? '#cfe2ff' : '#fff3cd') }};
                            color: {{ $refund_request['status'] === 'processed' ? '#155724' : ($refund_request['status'] === 'approved' ? '#084298' : '#856404') }};
                        ">
                            {{ ucfirst($refund_request['status']) }}
                        </span>
                    </td>
                    @if($refund_request['processed_at'])
                    <td rowspan="{{ $refund_request['cancellation_fee'] > 0 ? 3 : 2 }}">{{ $refund_request['processed_at'] }}</td>
                    @endif
                </tr>
                @if($refund_request['cancellation_fee'] > 0)
                <tr>
                    <td>Cancellation Fee</td>
                    <td>-₱{{ number_format($refund_request['cancellation_fee'], 2) }}</td>
                </tr>
                @endif
                <tr class="total-row" style="background-color: #fff3cd;">
                    <td><strong>Refund Amount</strong></td>
                    <td class="amount" style="color: #dc3545;">₱{{ number_format($refund_request['refund_amount'], 2) }}</td>
                </tr>
            </tbody>
        </table>
        @if($refund_request['reason'])
        <div style="margin-top: 10px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
            <strong>Reason:</strong> {{ $refund_request['reason'] }}
        </div>
        @endif
    </div>
    @endif
    
    @if($notes)
    <div class="notes-section">
        <h4>Additional Notes</h4>
        <p>{{ $notes }}</p>
    </div>
    @endif
    
    <div class="footer">
        <p><strong>Thank you for choosing Kreative Dental & Orthodontics!</strong></p>
        <p>Please keep this receipt for your records.</p>
        <p>For inquiries, please contact us at {{ $clinic_phone }} or {{ $clinic_email }}</p>
        <p>Generated on {{ $receipt_date }} at {{ $receipt_time }}</p>
    </div>
</body>
</html>
