import { Link, useLocation } from "react-router-dom";
import { BsArrowLeft } from "react-icons/bs";
import { AnimationLayout } from "../../../layouts";

export const Error404Page = () => {
  const location = useLocation();

  return (
    <AnimationLayout prevPathname={location?.state?.prevPathname}>
      <div className={`fixed inset-0 bg-white flex flex-col justify-center gap-26 items-center`}>

        <div className="flex flex-col gap-4 items-center">
          <div className={`text-9xl tracking-widest font-extrabold linear-text bg-linear-to-r from-[#5fbabf] to-[#fc8c8c]`}>
            404
          </div>
          <div className="italic text-2xl font-bold">
            Page Non Trouvée
          </div>
        </div>

        <Link
          to={-1}
          state={{ prevPathname: location.pathname }}
          className={`shadow-md bg-linear-to-r from-[#5fbabf] to-[#fc8c8c] text-white text-lg uppercase rounded-full flex justify-center items-center gap-4 tracking-widest py-4 px-8 text-center active:brightness-soft`}
        >
          <BsArrowLeft className={`text-2xl`} />
          <div>
            Retour
          </div>
        </Link>
        
      </div>
    </AnimationLayout>
  );
};
