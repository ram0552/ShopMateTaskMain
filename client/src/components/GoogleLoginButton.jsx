import { GoogleLogin } from "@react-oauth/google";
import api from "../utils/api";
import { useNavigate } from "react-router-dom";

const GoogleLoginButton = () => {
    const navigate = useNavigate();
    const handleSuccess = async (credentialResponse) => {
        try {
            const response = await api.post("/users/google", {
                token: credentialResponse.credential
            });

            localStorage.setItem(
                "accessToken",
                response.data.accessToken
            );

            localStorage.setItem(
                "refreshToken",
                response.data.refreshToken
            );

            localStorage.setItem(
                "user",
                JSON.stringify(response.data.user)
            );

            window.dispatchEvent(new Event('shopmate:auth-changed'));

            if (response.data.user.role === "admin") {
                navigate("/admin");
            } else {
                navigate("/home");
            }

            console.log("Login Success");
        } catch (err) {
            if (err.response?.status === 404) {
                alert(err.response.data.message);

                navigate("/register", {
                    state: {
                        email: credentialResponse?.email
                    }
                });
            } else {
                alert("Google login failed. Please try again.");
            }
        }
    };

    const handleError = () => {
        console.log("Google Login Failed");
    };

    return (
        <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            useOneTap={false}
        />
    );
};

export default GoogleLoginButton;
