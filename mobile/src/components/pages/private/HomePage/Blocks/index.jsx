import { useRef, useState } from "react";
import { FaChalkboardUser } from "react-icons/fa6";
import { FaBook, FaExternalLinkAlt, FaTools } from "react-icons/fa";
import { IoIosArrowDown } from "react-icons/io";
import { useTranslation } from "react-i18next";

export const Blocks = () => {
    const { t } = useTranslation(undefined, { keyPrefix: "home-page.blocks" });

    const [selectedBlock, setSelectedBlock] = useState(null);

    const blocks = [
        {
            Icon: FaBook,
            iconColor: "#5fbabf",
            key: "doc",
            link: ""
        },
        {
            Icon: FaTools,
            iconColor: "#fc8c8c",
            key: "smart-common",
            link: ""
        },
        {
            Icon: FaChalkboardUser,
            iconColor: "#5fbabf",
            key: "courses",
            link: ""
        },
    ];

    const blocksRefs = useRef([]);

    const handleBlockOnClick = (index) => {
        if (selectedBlock === index) {
            setSelectedBlock(null);
        } else {
            setSelectedBlock(index);
        }
    };
    
    return (
        <div className="flex flex-col gap-4">
            {blocks.map(({ title, Icon, iconColor, key, link }, BI) => {
                const isBlockOpen = selectedBlock === BI;
                return (
                    <div key={`block${BI}`} className={`flex flex-col bg-white p-4 text-md shadow-md rounded-xl ${isBlockOpen && "gap-4"} duration-200`}>
                        <div 
                            onClick={() => handleBlockOnClick(BI)} 
                            className="flex justify-between items-center gap-1"
                        >
                            <div 
                                style={{ "--color": iconColor }}
                                className="bg-(--color)/15 text-(--color) p-2 rounded-xl text-2xl"
                            >
                                <Icon />
                            </div>
                            <div className="font-semibold text-lg">
                                {t(`${key}.title`)}
                            </div>
                            <button className={`${isBlockOpen && "rotate-180"} text-xl bg-white p-2 rounded-full text-soft-text active:brightness-90 duration-100`}>
                                <IoIosArrowDown />
                            </button>
                        </div>
                        <div
                            ref={el => (blocksRefs.current[BI] = el)}
                            style={{
                                maxHeight: (isBlockOpen && blocksRefs.current[BI])
                                    ? `${blocksRefs.current[BI].scrollHeight}px`
                                    : "0",
                            }}
                            className="overflow-hidden duration-300 px-2 flex flex-col gap-4"
                        >
                            <div>
                                {t(`${key}.text`)}
                            </div>
                            <a 
                                href={link}
                                className="self-end italic underline flex items-center gap-2 text-[#283f5d] active:brightness-90 duration-100"
                            >
                                {t(`${key}.link`)}
                                <FaExternalLinkAlt />
                            </a>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};