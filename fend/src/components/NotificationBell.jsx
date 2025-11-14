import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useNotifications from "../context/NotificationsContext";

export default function NotificationBell() {
  const { items, unread, loading, error, loadList, loadUnread, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [clickedNotificationId, setClickedNotificationId] = useState(null);
  const isNavigatingRef = useRef(false);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  // panel position (viewport coords)
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const panelWidth = 340; // px — matches your current style

  const computePosition = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();

    // Prefer right-aligning panel to the bell, then clamp within viewport
    let left = r.right - panelWidth;
    left = Math.max(8, left); // never off-screen left
    left = Math.min(left, window.innerWidth - panelWidth - 8); // never off-screen right

    const top = Math.max(8, r.bottom + 8); // small gap, avoid going above viewport
    setPos({ top, left });
  };

  useEffect(() => { loadUnread(); }, [loadUnread]);

  const formatTimeAgo = (dateString) => {
    if (!dateString) return "";
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    // For dates older than a week, show relative days
    const diffInDays = Math.floor(diffInSeconds / 86400);
    return `${diffInDays}d ago`;
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Small delay to prevent flickering
      setTimeout(() => {
        computePosition();
      }, 10);
      await loadList();
      // Only mark as read if there are actually unread notifications
      if (unread > 0) {
        await markAllRead(); // clear badge
        await loadUnread();  // returns 0
      }
    }
  };

  const handleNotificationClick = (notification) => {
    console.log('Notification clicked:', notification);
    
    // Prevent multiple clicks
    if (isNavigatingRef.current) {
      console.log('Already navigating, ignoring click');
      return;
    }
    
    // Handle visit code notifications specially
    if (notification.type === 'visit_code' && notification.data?.visit_code) {
      console.log('Navigating to visit code:', notification.data.visit_code);
      
      // Set navigating flag and show visual feedback
      isNavigatingRef.current = true;
      setClickedNotificationId(notification.id);
      
      // Close the notification panel first
      setOpen(false);
      
      // Add delay to ensure smooth transition
      setTimeout(() => {
        navigate(`/dentist/visit/${notification.data.visit_code}`);
        // Reset flag after navigation
        setTimeout(() => {
          isNavigatingRef.current = false;
          setClickedNotificationId(null);
        }, 1500);
      }, 200);
      return;
    }
    
    // For other notifications, just close the panel
    setOpen(false);
  };

  // Close on Esc / outside click; reposition on resize
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onResize = () => computePosition();
    const onClickAway = (e) => {
      if (!panelRef.current || !btnRef.current) return;
      
      // Check if the click is outside both the panel and the button
      const isClickInsidePanel = panelRef.current.contains(e.target);
      const isClickInsideButton = btnRef.current.contains(e.target);
      
      if (!isClickInsidePanel && !isClickInsideButton) {
        setOpen(false);
      }
    };
    
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    document.addEventListener("mousedown", onClickAway);
    
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onClickAway);
    };
  }, [open]);

  return (
    <>
      <style>
        {`
          .notification-bell-btn:hover {
            background: rgba(255, 255, 255, 0.2) !important;
            transform: translateY(-1px) !important;
          }
        `}
      </style>
      <button
        ref={btnRef}
        onClick={toggle}
        className="btn d-inline-flex align-items-center notification-bell-btn"
        title="Notifications"
        aria-label="Notifications"
        style={{
          background: 'rgba(255, 255, 255, 0.15)',
          border: 'none',
          color: 'white',
          borderRadius: '8px',
          padding: '0.5rem 0.75rem',
          transition: 'all 0.2s ease'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="badge ms-2" style={{
            backgroundColor: '#dc3545',
            color: 'white',
            fontSize: '0.7rem',
            fontWeight: '600'
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          className="position-fixed" // <-- fixed to viewport, not the sidebar
          style={{
            top: pos.top,
            left: pos.left,
            width: panelWidth,
            zIndex: 1050,
            maxWidth: "calc(100vw - 16px)",
          }}
        >
          <div className="card shadow" style={{ borderRadius: '12px', border: 'none' }}>
            <div className="card-header py-3 d-flex align-items-center justify-content-between" style={{
              background: 'linear-gradient(135deg, #00b4d8 0%, #0077b6 100%)',
              color: 'white',
              borderRadius: '12px 12px 0 0'
            }}>
              <div>
                <strong style={{ fontSize: '1.1rem' }}>Notifications</strong>
                <div className="small" style={{ opacity: 0.9 }}>Clinic updates &amp; alerts</div>
              </div>
               <button 
                 className="btn btn-sm p-0 notification-close-btn" 
                 onClick={() => setOpen(false)}
                 style={{
                   color: 'white',
                   background: 'rgba(255,255,255,0.2)',
                   border: 'none',
                   borderRadius: '6px',
                   padding: '0.25rem 0.5rem',
                   fontSize: '0.8rem',
                   fontWeight: '600'
                 }}
               >
                Close
              </button>
            </div>

            <div className="list-group list-group-flush" style={{ maxHeight: 340, overflow: "auto" }}>
              {loading && (
                <div className="list-group-item small text-muted p-3" style={{ textAlign: 'center' }}>
                  <i className="bi bi-hourglass-split me-2"></i>Loading…
                </div>
              )}
              {error && !loading && (
                <div className="list-group-item small text-danger p-3" style={{ textAlign: 'center' }}>
                  <i className="bi bi-exclamation-triangle me-2"></i>{error}
                </div>
              )}
              {!loading && !error && items.length === 0 && (
                <div className="list-group-item small text-muted p-4" style={{ textAlign: 'center' }}>
                  <i className="bi bi-bell-slash display-6 d-block mb-2 text-muted"></i>
                  No notifications.
                </div>
              )}
               {!loading && !error && items.map((n) => (
                 <div 
                   key={n.id} 
                   className={`list-group-item small p-3 ${clickedNotificationId === n.id ? 'list-group-item-success' : ''}`}
                   style={{
                     borderLeft: 'none',
                     borderRight: 'none',
                     borderBottom: '1px solid #f1f3f4'
                   }}
                 >
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="me-3 flex-grow-1">
                      <div className="fw-semibold mb-1" style={{ color: '#1e293b', fontSize: '0.9rem' }}>
                        {n.title || "Notification"}
                        {n.severity === "danger"  && <span className="badge ms-2" style={{ backgroundColor: '#dc3545', color: 'white', fontSize: '0.65rem' }}>Important</span>}
                        {n.severity === "warning" && <span className="badge ms-2" style={{ backgroundColor: '#ffc107', color: '#000', fontSize: '0.65rem' }}>Warning</span>}
                        {n.severity === "info"    && <span className="badge ms-2" style={{ backgroundColor: '#00b4d8', color: 'white', fontSize: '0.65rem' }}>Info</span>}
                        {n.type === "visit_code" && <span className="badge ms-2" style={{ backgroundColor: '#28a745', color: 'white', fontSize: '0.65rem' }}>
                          <i className="bi bi-key me-1"></i>Visit Code
                        </span>}
                      </div>
        {n.body && (
          <div className="text-muted mt-1" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
            {n.type === "visit_code" && n.data?.visit_code ? (
              <>
                {n.body.split(n.data.visit_code)[0]}
                <span 
                  className="fw-bold text-primary"
                  style={{ 
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    backgroundColor: clickedNotificationId === n.id ? '#d1ecf1' : 'transparent',
                    padding: '1px 3px',
                    borderRadius: '3px'
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNotificationClick(n);
                  }}
                  title="Click to use visit code and continue"
                >
                  {n.data.visit_code}
                </span>
                {n.body.split(n.data.visit_code)[1]}
              </>
            ) : (
              n.body
            )}
          </div>
        )}
                      {n.data?.date && <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>Date: {n.data.date}</div>}
                    </div>
                    <div className="d-flex flex-column align-items-end">
                      {clickedNotificationId === n.id && (
                        <small className="text-success mb-1">
                          <i className="bi bi-arrow-right-circle me-1"></i>Opening visit...
                        </small>
                      )}
                      <small className="text-muted" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                        {formatTimeAgo(n.created_at)}
                      </small>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card-footer py-3 d-flex justify-content-between" style={{
              background: '#f8f9fa',
              borderRadius: '0 0 12px 12px',
              borderTop: '1px solid #e9ecef'
            }}>
               <Link 
                 to="/notifications" 
                 className="btn btn-sm p-0 notification-see-all-btn"
                 style={{
                   color: '#00b4d8',
                   background: 'transparent',
                   border: 'none',
                   fontWeight: '600',
                   fontSize: '0.8rem'
                 }}
               >
                See all
              </Link>
              <button 
                className="btn btn-sm p-0 notification-bottom-close-btn" 
                onClick={() => setOpen(false)}
                style={{
                  color: '#6c757d',
                  background: 'transparent',
                  border: 'none',
                  fontWeight: '600',
                  fontSize: '0.8rem'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
