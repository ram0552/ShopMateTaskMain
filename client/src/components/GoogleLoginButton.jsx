import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const GoogleLoginButton = () => {
    const navigate = useNavigate();
    const handleSuccess = async (credentialResponse) => {
    

        try {

            const response = await axios.post(
                `${import.meta.env.VITE_API_URL}/api/users/google`,
                {
                    token: credentialResponse.credential
                }
            );

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
            // if (user.role === "admin") {
            //     navigate("/admin");
            // } else {
            //     navigate("/home");
            // }
            if (response.data.user.role === "admin") {
                    navigate("/admin");
                } else {
                    navigate("/home");
                }

            console.log("Login Success");

        }  catch (err) {
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