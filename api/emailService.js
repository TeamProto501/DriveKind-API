// api/emailService.js

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY); // Assuming you set RESEND_API_KEY in .env

// --- HTML Template Function ---
function getRideAssignedEmailHtml({ clientName, rideDetails, dispatcherName, driverName, rideLink }) {
    const previewText = `Your DriveKind ride has been assigned! Driver: ${driverName}.`;
    const headerTitle = "Ride Assignment Confirmed! 🚗";
    const mainMessage = `
        <div class="greeting">Hello ${clientName},</div>
        <div class="message">
            We are pleased to confirm that a driver has been assigned to your ride request. 
            Your ride has been scheduled by **${dispatcherName}**.
            All the details of your trip are below.
        </div>
        <div class="message">
            You can view the full details and track your ride status at the link below.
            Please click on the link to see the assigned ride.
        </div>
    `;
    const footerMessage = "Please contact us immediately if you have any questions or need to make changes to your ride.";

    // Function to format a date/time stamp (simplified for string inclusion)
    const formatTimestamp = (ts) => {
        if (!ts) return 'N/A';
        const date = new Date(ts);
        return date.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', 
            hour: '2-digit', minute: '2-digit'
        });
    };

    // Construct the details section dynamically
    const detailsHtml = `
        <div class="detail-row">
            <div class="detail-label">Pickup Time</div>
            <div class="detail-value">${formatTimestamp(rideDetails.scheduled_time)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Pickup Address</div>
            <div class="detail-value">${rideDetails.pickup_address}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Dropoff Address</div>
            <div class="detail-value">${rideDetails.dropoff_address}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Assigned Driver</div>
            <div class="detail-value">${driverName}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Ride Status</div>
            <div class="detail-value status">SCHEDULED</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Confirmation ID</div>
            <div class="detail-value">#${rideDetails.ride_id}</div>
        </div>
    `;

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Ubuntu', sans-serif;
                    background-color: #f6f9fc;
                    color: #525f7f;
                    line-height: 1.5;
                }
                .preview-text {
                    display: none;
                    max-height: 0;
                    overflow: hidden;
                    mso-hide: all;
                }
                .email-wrapper {
                    width: 100%;
                    background-color: #f6f9fc;
                    padding: 40px 0;
                }
                .email-content {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 40px 40px 35px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    color: #ffffff;
                    font-size: 24px;
                    font-weight: 600;
                    letter-spacing: -0.5px;
                }
                .content {
                    padding: 40px;
                }
                .greeting {
                    font-size: 16px;
                    color: #32325d;
                    margin-bottom: 24px;
                }
                .message {
                    font-size: 15px;
                    color: #525f7f;
                    margin-bottom: 32px;
                    line-height: 24px;
                }
                .details-card {
                    background-color: #f6f9fc;
                    border-radius: 8px;
                    padding: 24px;
                    margin-bottom: 24px;
                }
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 0;
                    border-bottom: 1px solid #e6ebf1;
                    gap: 16px;
                }
                .detail-row:last-child {
                    border-bottom: none;
                    padding-bottom: 0;
                }
                .detail-row:first-child {
                    padding-top: 0;
                }
                .detail-label {
                    font-size: 14px;
                    color: #8898aa;
                    font-weight: 500;
                    flex-shrink: 0;
                }
                .detail-value {
                    font-size: 15px;
                    color: #32325d;
                    font-weight: 600;
                    text-align: right;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                }
                .detail-value.status {
                    background-color: #d4edda;
                    color: #155724;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    display: inline-flex;
                    align-items: center;
                }
                .detail-value.amount {
                    color: #667eea;
                    font-size: 18px;
                }
                .footer-note {
                    background-color: #f8f9fa;
                    border-left: 4px solid #667eea;
                    padding: 16px 20px;
                    margin: 24px 0;
                    border-radius: 4px;
                    font-size: 14px;
                    color: #525f7f;
                }
                .footer {
                    padding: 32px 40px;
                    background-color: #f6f9fc;
                    text-align: center;
                    border-top: 1px solid #e6ebf1;
                }
                .footer p {
                    margin: 0;
                    font-size: 13px;
                    color: #8898aa;
                    line-height: 20px;
                }
                .footer-logo {
                    margin-bottom: 12px;
                    font-size: 16px;
                    font-weight: 700;
                    color: #32325d;
                }
                .call-to-action {
                    text-align: center;
                    margin-bottom: 32px;
                }
                .button {
                    background-color: #667eea;
                    color: #ffffff !important;
                    text-decoration: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 16px;
                    display: inline-block;
                }
                @media only screen and (max-width: 640px) {
                    .email-wrapper {
                        padding: 20px 0;
                    }
                    .content {
                        padding: 30px 24px;
                    }
                    .header {
                        padding: 30px 24px 25px;
                    }
                    .footer {
                        padding: 24px;
                    }
                    .detail-row {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 8px;
                    }
                    .detail-value {
                        text-align: left;
                        margin-top: 4px;
                        width: 100%; /* Fix layout on mobile */
                    }
                    .detail-value.status {
                        justify-content: center;
                        width: auto;
                    }
                }
            </style>
        </head>
        <body>
            <div class="preview-text">
                ${previewText}
            </div>
            
            <div class="email-wrapper">
                <div class="email-content">
                    <div class="header">
                        <h1>${headerTitle}</h1>
                    </div>
                    
                    <div class="content">
                        ${mainMessage}
                        
                        <div class="call-to-action">
                            <a href="${rideLink}" class="button">View Ride Details</a>
                        </div>
                        
                        <div class="details-card">
                            ${detailsHtml}
                        </div>
                        
                        <div class="footer-note">
                            ${footerMessage}
                        </div>
                    </div>
                    
                    <div class="footer">
                        <div class="footer-logo">DriveKind Application</div>
                        <p>This is an automated ride confirmation notification from DriveKind.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

// --- Main Sending Function ---
async function sendRideAssignedEmail({ recipientEmail, clientName, rideDetails, dispatcherName, driverName }) {
    if (!recipientEmail) {
        console.error("Email not sent: Recipient email is missing.");
        return { error: "Recipient email is missing" };
    }

    const emailSubject = `Your DriveKind Ride #${rideDetails.ride_id} is Confirmed`;
    
    // The frontend link for clients to view the ride
    // NOTE: Although the provided link is for '/driver/rides', we assume a public or client-specific view link for the actual notification:
    const clientRideLink = `https://drive-kind-frontend.vercel.app/rides/${rideDetails.ride_id}`; 

    const htmlContent = getRideAssignedEmailHtml({
        clientName,
        rideDetails,
        dispatcherName,
        driverName,
        rideLink: clientRideLink
    });

    try {
        const response = await resend.emails.send({
            from: 'DriveKind <team@driverkind.info>', // Sender email with custom domain
            to: recipientEmail,
            subject: emailSubject,
            html: htmlContent
        });
        
        console.log('Resend email sent successfully:', response);
        return { success: true, response };
    } catch (error) {
        console.error('Failed to send Resend email:', error);
        return { error: error.message || "Failed to send email" };
    }
}

module.exports = {
    sendRideAssignedEmail
};