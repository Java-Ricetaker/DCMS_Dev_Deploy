import { useEffect, useState } from "react";
import api from "../../api/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { Modal, Button, Form } from "react-bootstrap";
import toast from "react-hot-toast";

function AppointmentReminders() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState({});
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    fetchRemindableAppointments();
  }, []);

  const fetchRemindableAppointments = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/appointments/remindable");
      setAppointments(res.data);
    } catch (err) {
      console.error("Failed to load remindable appointments", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (appointment) => {
    // Additional safety check - only allow reminders for approved appointments
    if (appointment.status !== 'approved') {
      toast.error('Only approved appointments can receive reminders.');
      return;
    }

    const name = appointment.patient?.user?.name || "Patient";
    const msg = `Hello ${name}, this is a reminder for your dental appointment on ${appointment.date} at ${appointment.time_slot} for ${appointment.service?.name}. Ref: ${appointment.reference_code}. Please arrive on time. – Kreative Dental Clinic`;

    setSelected(appointment);
    setMessage(msg);
    setEdited(false);
    setShowModal(true);
  };

  const handleSend = async () => {
    if (!selected) return;

    const id = selected.id;
    setSending((prev) => ({ ...prev, [id]: true }));

    try {
      await api.post(`/api/appointments/${id}/send-reminder`, {
        message,
        edited,
      });

      toast.success("SMS reminder sent!");
      setShowModal(false);
      fetchRemindableAppointments();
    } catch (err) {
      toast.error("Failed to send SMS reminder.");
      console.error(err);
    } finally {
      setSending((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="container mt-4">
      <h3>📤 Appointment Reminders</h3>

      {loading ? (
        <LoadingSpinner message="Loading remindable appointments..." />
      ) : appointments.length === 0 ? (
        <p className="text-muted mt-3">
          No appointments eligible for reminder at this time.
        </p>
      ) : (
        <div className="table-responsive mt-3">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th>Date</th>
                <th>Time Slot</th>
                <th>Patient</th>
                <th>Service</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td>{a.date}</td>
                  <td>{a.time_slot}</td>
                  <td>{a.patient?.user?.name || "N/A"}</td>
                  <td>{a.service?.name}</td>
                  <td>
                    <span className={`badge ${a.status === 'approved' ? 'bg-success' : 'bg-warning'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td>{a.patient?.user?.email || "—"}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={sending[a.id] || a.status !== 'approved'}
                      onClick={() => handleOpenModal(a)}
                    >
                      {sending[a.id] ? "Sending..." : "Send SMS Reminder"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Edit SMS Reminder Message</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group controlId="reminderMessage">
            <Form.Label>Message to be sent</Form.Label>
            <Form.Control
              as="textarea"
              rows={5}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setEdited(true);
              }}
            />
          </Form.Group>
          {!edited && (
            <div className="mt-2 text-muted small">
              ✏️ This is the default message. You can edit it before sending.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={sending[selected?.id]}
          >
            {sending[selected?.id] ? "Sending..." : "Send SMS Reminder"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default AppointmentReminders;
